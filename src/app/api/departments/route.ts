import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

export const BUILTIN_DEPARTMENTS = [
  { value: 'New York Times Tier 1',      label: 'New York Times — Tier 1',      group: 'NYT' },
  { value: 'New York Times Tier 2',      label: 'New York Times — Tier 2',      group: 'NYT' },
  { value: 'New York Times Tier 3',      label: 'New York Times — Tier 3',      group: 'NYT' },
  { value: 'New York Times Digital',     label: 'New York Times — Digital',     group: 'NYT' },
  { value: 'Subject Matter Expert',      label: 'Subject Matter Expert',        group: 'NYT' },
  { value: 'Workforce',                  label: 'Workforce',                    group: 'Otros' },
  { value: 'Quality Assurance',          label: 'Quality Assurance',            group: 'Otros' },
  { value: 'IT',                         label: 'IT',                           group: 'Otros' },
  { value: 'Operations',                 label: 'Operations',                   group: 'Otros' },
  { value: 'HR',                         label: 'HR',                           group: 'Otros' },
];

// GET  /api/departments  → returns built-ins + custom
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: custom } = await supabase
      .from('custom_departments')
      .select('name, group_name')
      .order('created_at', { ascending: true });

    const customList = (custom ?? []).map(d => ({
      value: d.name,
      label: d.name,
      group: d.group_name ?? 'Custom',
    }));

    return NextResponse.json({ departments: [...BUILTIN_DEPARTMENTS, ...customList] });
  } catch {
    return NextResponse.json({ departments: BUILTIN_DEPARTMENTS });
  }
}

// POST /api/departments  → create a new custom department
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!actor || !['admin', 'moderator_a1'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { name, group } = await req.json() as { name: string; group?: string };
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const service = await createServiceClient();
    const { error } = await service.from('custom_departments').insert({
      name: name.trim(),
      group_name: group?.trim() || 'Custom',
      created_by: user.id,
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Department already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, name: name.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create department';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/departments  → remove a custom department by name
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!actor || !['admin', 'moderator_a1'].includes(actor.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { name } = await req.json() as { name: string };
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const service = await createServiceClient();
    const { error } = await service.from('custom_departments').delete().eq('name', name.trim());
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete department';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
