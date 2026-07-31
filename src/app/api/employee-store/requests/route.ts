import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { requireEmployeeRole } from '@backend/modules/access/application/employee-role';

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return 'Internal server error';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();

  if (!await requireEmployeeRole(user.id, service)) {
    return NextResponse.json({ requests: [], store: null });
  }

  try {
    const [{ data: requests }, { data: store }] = await Promise.all([
      service
        .from('employee_store_requests')
        .select('id, store_name, description, category, status, review_notes, reviewed_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      service
        .from('employee_stores')
        .select('id, slug, name, status')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      requests: requests ?? [],
      store: store ?? null,
    });
  } catch (err) {
    console.error('GET /api/employee-store/requests error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeName = String(body?.store_name ?? '').trim();
    const description = String(body?.description ?? '').trim();
    const category = body?.category ? String(body.category).trim() : null;
    const policyAccepted = Boolean(body?.policy_accepted);

    if (!storeName || storeName.length < 3) {
      return NextResponse.json({ error: 'Store name must be at least 3 characters.' }, { status: 400 });
    }
    if (!description || description.length < 20) {
      return NextResponse.json({ error: 'Please describe your store (at least 20 characters).' }, { status: 400 });
    }
    if (!policyAccepted) {
      return NextResponse.json({ error: 'You must accept the store policy.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = await createServiceClient();

    if (!await requireEmployeeRole(user.id, service)) {
      return NextResponse.json(
        { error: 'Solo los empleados pueden solicitar una tienda personal.' },
        { status: 403 },
      );
    }

    const { data: existingStore } = await service
      .from('employee_stores')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingStore) {
      return NextResponse.json({ error: 'You already have an active store.' }, { status: 409 });
    }

    const { data: pending } = await service
      .from('employee_store_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) {
      return NextResponse.json({ error: 'You already have a pending request.' }, { status: 409 });
    }

    const { data: inserted, error } = await service
      .from('employee_store_requests')
      .insert({
        user_id: user.id,
        store_name: storeName,
        description,
        category,
        policy_accepted: policyAccepted,
        status: 'pending',
      })
      .select('id, store_name, description, category, status, created_at')
      .single();

    if (error) throw error;

    // Notify moderators
    const { data: mods } = await service.from('users').select('id').in('role', ['moderator', 'moderator_a1', 'admin']);
    if (mods && mods.length > 0) {
      await service.from('notifications').insert(
        mods.map((m) => ({
          user_id: m.id,
          title: 'New employee store request',
          message: `An employee submitted a request to open "${storeName}". Review it in the employee stores queue.`,
          type: 'store',
        })),
      );
    }

    // Suggested slug for future approval
    const suggestedSlug = slugify(storeName);

    return NextResponse.json({ request: inserted, suggestedSlug });
  } catch (err) {
    console.error('POST /api/employee-store/requests error:', err);
    return NextResponse.json({ error: toMessage(err) }, { status: 500 });
  }
}
