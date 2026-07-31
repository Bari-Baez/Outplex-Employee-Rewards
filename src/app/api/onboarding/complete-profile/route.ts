import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      name?: string;
      employee_id?: string;
      supervisor_id?: string | null;
      department?: string;
    };

    const name = body.name?.trim() ?? '';
    const employeeId = body.employee_id?.trim() ?? '';
    const department = body.department?.trim() ?? '';
    const supervisorId = body.supervisor_id ?? null;

    if (!name || !employeeId || !department) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 },
      );
    }

    if (!supervisorId) {
      return NextResponse.json(
        { error: 'Please select a supervisor.' },
        { status: 400 },
      );
    }

    const service = await createServiceClient();
    const { data: supervisor } = await service
      .from('users')
      .select('id, name, email, role')
      .eq('id', supervisorId)
      .maybeSingle();

    if (!supervisor || supervisor.role !== 'moderator_b1') {
      return NextResponse.json(
        { error: 'Selected supervisor is not available.' },
        { status: 400 },
      );
    }

    const supervisorName =
      supervisor.name?.trim() || supervisor.email?.trim() || 'Supervisor';

    const { error } = await service
      .from('users')
      .update({
        name,
        employee_id: employeeId,
        supervisor_id: supervisorId,
        supervisor: supervisorName,
        department,
        email: user.email,
      })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save profile.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
