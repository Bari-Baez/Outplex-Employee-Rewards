import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/onboarding/request-access
 * Submits a specialized access request during onboarding.
 * Updates the user's basic profile and creates a role_request record.
 * Gracefully handles missing 'notes' column by falling back to
 * storing metadata in the requested_role field as JSON.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, employee_id, functional_area, reason } = body;

    if (!name || !employee_id || !functional_area || !reason) {
      return NextResponse.json(
        { error: 'All fields are required: name, employee_id, functional_area, reason' },
        { status: 400 }
      );
    }

    const service = await createServiceClient();

    // Update user's basic profile with whatever they provided
    const { error: profileError } = await service
      .from('users')
      .update({
        name: name.trim(),
        employee_id: employee_id.trim(),
      })
      .eq('id', user.id);

    if (profileError) throw profileError;

    // Check if there's already a pending request for this user
    const { data: existingRequest } = await service
      .from('role_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (!existingRequest) {
      const metaJson = JSON.stringify({
        type: 'specialized_access',
        functional_area: functional_area.trim(),
        reason: reason.trim(),
      });

      // Try inserting with 'notes' column first (available after migration)
      const { error: requestError } = await service
        .from('role_requests')
        .insert({
          user_id: user.id,
          requested_role: 'specialized_access',
          status: 'pending',
          notes: metaJson,
        });

      // If notes column doesn't exist yet, fall back without it
      if (requestError?.message?.includes('notes')) {
        const { error: retryError } = await service
          .from('role_requests')
          .insert({
            user_id: user.id,
            requested_role: metaJson, // store metadata here as fallback
            status: 'pending',
          });
        if (retryError) throw retryError;
      } else if (requestError) {
        throw requestError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Request access error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to request access.' },
      { status: 500 },
    );
  }
}
