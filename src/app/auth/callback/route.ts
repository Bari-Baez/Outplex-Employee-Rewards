import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getSlackUserProfile, getSlackTeamProfile } from '@/lib/slack/oauth';

function getAllowedDomains() {
  const configuredDomains = process.env.ALLOWED_EMAIL_DOMAINS
    ? process.env.ALLOWED_EMAIL_DOMAINS.split(',').map((domain) => domain.trim().toLowerCase()).filter(Boolean)
    : [];

  const defaults =
    process.env.NODE_ENV === 'production'
      ? ['outplex.com']
      : ['outplex.com', 'outplex.test', 'gmail.com'];

  return [...new Set([...defaults, ...configuredDomains])];
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const providerError = searchParams.get('error');
  if (providerError) {
    const mapped = providerError === 'access_denied' ? 'access_denied' : 'auth_failed';
    return NextResponse.redirect(`${origin}/login?error=${mapped}`);
  }

  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const slackUser = data.user;
      const userMeta = slackUser.user_metadata;
      const email = (slackUser.email || userMeta?.email || userMeta?.preferred_email || '') as string;
      
      const allowedDomains = getAllowedDomains();
      const userDomain = email.split('@')[1]?.toLowerCase();
      
      if (!userDomain || !allowedDomains.includes(userDomain)) {
        console.warn(`Blocked login attempt from unauthorized domain: ${userDomain}`);
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`);
      }

      const { data: existingUser } = await supabase
        .from('users')
        .select('role, is_approved, employee_id')
        .eq('id', slackUser.id)
        .maybeSingle();

      // --- Port Employee ID from Slack ---
      let employeeId = existingUser?.employee_id || null;
      const slackId = userMeta?.provider_id || slackUser.id;

      if (!employeeId) {
        try {
          const profile = await getSlackUserProfile(slackId);
          if (profile?.fields) {
            // Priority 1: Exact field ID from env
            let fieldId = process.env.SLACK_EMPLOYEE_ID_FIELD_ID;

            // Priority 2: Auto-discovery by label "Employee ID"
            if (!fieldId) {
              const teamProfile = await getSlackTeamProfile();
              const targetField = teamProfile?.fields.find(f => 
                f.label.toLowerCase().includes('employee id') || 
                f.label.toLowerCase().includes('employee number')
              );
              if (targetField) fieldId = targetField.id;
            }

            if (fieldId && profile.fields[fieldId]) {
              employeeId = profile.fields[fieldId].value;
            }
          }
        } catch (err) {
          console.error('Error porting employee_id from Slack:', err);
        }
      }

      const { error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            id: slackUser.id,
            slack_id: slackId,
            name: userMeta?.full_name || userMeta?.name || email.split('@')[0] || 'Employee',
            email: email,
            avatar_url: userMeta?.avatar_url || userMeta?.picture || null,
            employee_id: employeeId,
            // Preserve existing role — never downgrade admin/moderator on re-login
            role: existingUser?.role ?? 'employee',
            // Preserve approval status — only false for brand-new users
            is_approved: existingUser ? existingUser.is_approved : false,
          },
          {
            onConflict: 'id',
            ignoreDuplicates: false,
          }
        );

      if (upsertError) {
        console.error('Upsert profile error:', upsertError);
      }

      // Append a signal for the onboarding modal to skip the "returning visit" logout
      const redirectUrl = new URL(`${origin}${next}`);
      redirectUrl.searchParams.set('onboarding_auth', '1');
      
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  // Auth error — redirect to login with error message
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
