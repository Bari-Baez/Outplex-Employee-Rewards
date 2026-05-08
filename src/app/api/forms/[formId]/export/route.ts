import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { FormField } from '@/lib/forms/types';
import { isFormModeratorRole } from '@/lib/forms/auth';
import { generateFormExcel } from '@/lib/forms-excel';

type Ctx = { params: Promise<{ formId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serviceClient.from('users').select('role, name, email').eq('id', user.id).single();
    if (!profile || !isFormModeratorRole(profile.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { formId } = await ctx.params;

    const [{ data: form }, { data: responses }] = await Promise.all([
      serviceClient.from('forms').select('title,description,fields').eq('id', formId).single(),
      serviceClient
        .from('form_responses')
        .select('*, user:users(id, name, email, employee_id)')
        .eq('form_id', formId)
        .order('submitted_at', { ascending: true }),
    ]);

    if (!form) return NextResponse.json({ error: 'Form not found.' }, { status: 404 });

    const fields = ((form.fields as FormField[]) ?? []);
    const exportedBy = (profile.name as string | null) ?? (profile.email as string | null) ?? 'Moderador';

    const buffer = await generateFormExcel(
      { title: form.title as string, description: form.description as string | null, fields },
      (responses ?? []).map((r) => ({
        submitted_at: r.submitted_at as string,
        user: r.user as { name?: string; email?: string; employee_id?: string | null } | null,
        answers: r.answers as Record<string, unknown> | undefined,
      })),
      { exportedBy, exportedAt: new Date() },
    );

    const filename = `${(form.title as string).replace(/[^a-z0-9]/gi, '_')}_respuestas.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
