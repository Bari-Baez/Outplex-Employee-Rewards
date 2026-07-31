import 'server-only';

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSlackTeamProfile, getSlackUserProfile } from '@/lib/slack/oauth';
import { getAllowedEmailDomains, getAppOrigin, getOptionalServerEnv } from '@/platform/config/server-env';
import { safeRelativePath } from '@/platform/http/redirects';
import { withRequestId } from '@/platform/http/responses';
import { getRequestId, logServerError } from '@/platform/observability/request-context';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getMetadataString(metadata: Record<string, unknown>, key: string, maxLength: number): string {
  const value = metadata[key];
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeHttpUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function redirectTo(appOrigin: URL, path: string, requestId: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, appOrigin));
  response.headers.set('Cache-Control', 'no-store');
  return withRequestId(response, requestId);
}

function loginError(appOrigin: URL, error: string, requestId: string): NextResponse {
  const target = new URL('/login', appOrigin);
  target.searchParams.set('error', error);
  return redirectTo(appOrigin, `${target.pathname}${target.search}`, requestId);
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const appOrigin = getAppOrigin();
    const searchParams = new URL(request.url).searchParams;
    const providerError = searchParams.get('error');
    if (providerError) {
      return loginError(appOrigin, providerError === 'access_denied' ? 'access_denied' : 'auth_failed', requestId);
    }

    const code = searchParams.get('code');
    if (!code || code.length > 4_096) {
      return loginError(appOrigin, 'auth_failed', requestId);
    }

    const nextPath = safeRelativePath(searchParams.get('next'), '/dashboard');
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      return loginError(appOrigin, 'auth_failed', requestId);
    }

    const authUser = data.user;
    const serviceClient = await createServiceClient();
    const metadata = isRecord(authUser.user_metadata) ? authUser.user_metadata : {};
    const email = (
      authUser.email
      || getMetadataString(metadata, 'email', 320)
      || getMetadataString(metadata, 'preferred_email', 320)
    ).trim().toLowerCase();
    const emailMatch = /^([^@\s]{1,64})@([^@\s]{1,253})$/.exec(email);
    const userDomain = emailMatch?.[2]?.toLowerCase();

    if (!userDomain || !getAllowedEmailDomains().has(userDomain)) {
      await supabase.auth.signOut();
      return loginError(appOrigin, 'unauthorized_domain', requestId);
    }

    const { data: existingUser, error: profileError } = await serviceClient
      .from('users')
      .select('role, is_approved, employee_id, slack_id')
      .eq('id', authUser.id)
      .maybeSingle();
    if (profileError) {
      logServerError('auth.callback.profile', requestId, profileError);
      await supabase.auth.signOut();
      return loginError(appOrigin, 'auth_failed', requestId);
    }

    const providerId = getMetadataString(metadata, 'provider_id', 64);
    const slackId = /^[A-Z][A-Z0-9]{1,31}$/.test(providerId)
      ? providerId
      : existingUser?.slack_id || authUser.id;
    let employeeId = existingUser?.employee_id || null;

    if (!employeeId && /^[A-Z][A-Z0-9]{1,31}$/.test(slackId)) {
      try {
        const profile = await getSlackUserProfile(slackId);
        if (profile?.fields && isRecord(profile.fields)) {
          let fieldId = getOptionalServerEnv('SLACK_EMPLOYEE_ID_FIELD_ID');
          if (fieldId && !/^[A-Za-z0-9_-]{1,80}$/.test(fieldId)) fieldId = null;

          if (!fieldId) {
            const teamProfile = await getSlackTeamProfile();
            const targetField = teamProfile?.fields.find((field) => {
              const label = field.label.toLowerCase();
              return label.includes('employee id') || label.includes('employee number');
            });
            fieldId = targetField?.id ?? null;
          }

          const field = fieldId ? profile.fields[fieldId] : null;
          const value = isRecord(field) && typeof field.value === 'string' ? field.value.trim() : '';
          if (/^[A-Za-z0-9_-]{1,64}$/.test(value)) employeeId = value;
        }
      } catch (slackError) {
        logServerError('auth.callback.slack_profile', requestId, slackError);
      }
    }

    const displayName = (
      getMetadataString(metadata, 'full_name', 120)
      || getMetadataString(metadata, 'name', 120)
      || emailMatch?.[1]
      || 'Employee'
    );
    const avatarUrl = safeHttpUrl(
      getMetadataString(metadata, 'avatar_url', 2_048)
      || getMetadataString(metadata, 'picture', 2_048),
    );

    const { error: upsertError } = await serviceClient.from('users').upsert(
      {
        id: authUser.id,
        slack_id: slackId,
        name: displayName,
        email,
        avatar_url: avatarUrl,
        employee_id: employeeId,
        role: existingUser?.role ?? 'employee',
        is_approved: existingUser?.is_approved ?? false,
      },
      { onConflict: 'id', ignoreDuplicates: false },
    );

    if (upsertError) {
      logServerError('auth.callback.upsert', requestId, upsertError);
      await supabase.auth.signOut();
      return loginError(appOrigin, 'auth_failed', requestId);
    }

    const redirectUrl = new URL(nextPath, appOrigin);
    redirectUrl.searchParams.set('onboarding_auth', '1');
    return redirectTo(appOrigin, `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`, requestId);
  } catch (error) {
    logServerError('auth.callback', requestId, error);
    try {
      return loginError(getAppOrigin(), 'auth_failed', requestId);
    } catch {
      return new NextResponse(null, {
        status: 500,
        headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId },
      });
    }
  }
}
