import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'store';
}

async function ensureUniqueSlug(service: Awaited<ReturnType<typeof createServiceClient>>, base: string) {
  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const { data } = await service
      .from('employee_stores')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt + 1}`;
  }
  return `${base}-${Date.now()}`;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  try {
    const body = await req.json();
    const decision = String(body?.decision ?? '').toLowerCase();
    const notes = body?.notes ? String(body.notes).trim() : null;

    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('users').select('id, name, role').eq('id', user.id).single();
    if (!actor || !['moderator', 'moderator_a1', 'admin'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: service,
      toolKey: 'employee_stores',
      sectionKey: 'main',
      userRole: actor.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const { data: request } = await service
      .from('employee_store_requests')
      .select('id, user_id, store_name, description, category, status')
      .eq('id', requestId)
      .single();

    if (!request) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 409 });
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await service
      .from('employee_store_requests')
      .update({
        status: decision,
        reviewed_by: actor.id,
        reviewed_at: nowIso,
        review_notes: notes,
      })
      .eq('id', requestId);
    if (updateError) throw updateError;

    let store: { id: string; slug: string } | null = null;
    if (decision === 'approved') {
      const { data: existing } = await service
        .from('employee_stores')
        .select('id, slug')
        .eq('owner_id', request.user_id)
        .maybeSingle();

      if (existing) {
        store = existing;
        // Make sure it's active but don't force is_open: false if it already exists
        const { error: activateError } = await service
          .from('employee_stores')
          .update({ status: 'active' })
          .eq('id', existing.id);
        if (activateError) throw activateError;
      } else {
        const base = slugify(request.store_name);
        const slug = await ensureUniqueSlug(service, base);
        const { data: created, error: storeError } = await service
          .from('employee_stores')
          .insert({
            owner_id: request.user_id,
            request_id: request.id,
            slug,
            name: request.store_name,
            description: request.description,
            category: request.category,
            status: 'active',
            is_open: false,
            approved_by: actor.id,
            approved_at: nowIso,
          })
          .select('id, slug')
          .single();
        if (storeError) throw storeError;
        store = created;
      }
    }

    await service.from('notifications').insert({
      user_id: request.user_id,
      title: decision === 'approved' ? 'Store request approved' : 'Store request rejected',
      message:
        decision === 'approved'
          ? `Your request for "${request.store_name}" was approved by ${actor.name}. You can now set up your store.`
          : `Your request for "${request.store_name}" was rejected by ${actor.name}.${notes ? ` Reason: ${notes}` : ''}`,
      type: 'store',
    });

    return NextResponse.json({ success: true, decision, store });
  } catch (err) {
    console.error('PATCH /api/moderator/employee-store/requests/[id] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
