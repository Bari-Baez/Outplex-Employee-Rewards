import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isFormModeratorRole } from '@/lib/forms/auth';

type Ctx = { params: Promise<{ formId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
    if (!profile || !isFormModeratorRole(profile.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { formId } = await ctx.params;

    const [{ data: allEmployees }, { data: responses }] = await Promise.all([
      serviceClient.from('users').select('id, name, email, employee_id').eq('role', 'employee').order('name'),
      serviceClient.from('form_responses').select('user_id, submitted_at').eq('form_id', formId),
    ]);

    const responseMap = new Map<string, string>();
    for (const r of responses ?? []) {
      responseMap.set(r.user_id as string, r.submitted_at as string);
    }

    const completed: { id: string; name: string; email: string; employee_id: string | null; submitted_at: string }[] = [];
    const pending: { id: string; name: string; email: string; employee_id: string | null }[] = [];

    for (const emp of allEmployees ?? []) {
      const submittedAt = responseMap.get(emp.id as string);
      if (submittedAt) {
        completed.push({
          id: emp.id as string,
          name: emp.name as string,
          email: emp.email as string,
          employee_id: emp.employee_id as string | null,
          submitted_at: submittedAt,
        });
      } else {
        pending.push({
          id: emp.id as string,
          name: emp.name as string,
          email: emp.email as string,
          employee_id: emp.employee_id as string | null,
        });
      }
    }

    return NextResponse.json({ data: { completed, pending } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
