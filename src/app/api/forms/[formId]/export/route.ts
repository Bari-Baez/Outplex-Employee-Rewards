import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { FormField } from '@/lib/forms/types';
import { isFormModeratorRole } from '@/lib/forms/auth';

type Ctx = { params: Promise<{ formId: string }> };

function escapeCsv(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(Array.isArray(value) ? value.join('; ') : value);
  if (str.includes(',') || str.includes('"') || str.includes('\n'))
    return `"${str.replace(/"/g, '""')}"`;
  return str;
}

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

    const [{ data: form }, { data: responses }] = await Promise.all([
      serviceClient.from('forms').select('title,fields').eq('id', formId).single(),
      serviceClient
        .from('form_responses')
        .select('*, user:users(id, name, email, employee_id)')
        .eq('form_id', formId)
        .order('submitted_at', { ascending: true }),
    ]);

    if (!form) return NextResponse.json({ error: 'Form not found.' }, { status: 404 });

    const fields = ((form.fields as FormField[]) ?? []).filter((f) => f.type !== 'section');

    // Build CSV header
    const headers = ['Empleado', 'Correo', 'ID Empleado', 'Fecha de envío', ...fields.map((f) => f.label)];
    const rows: string[][] = [headers];

    for (const r of responses ?? []) {
      const u = r.user as { name?: string; email?: string; employee_id?: string | null } | null;
      const answers = (r.answers ?? {}) as Record<string, unknown>;
      const row: string[] = [
        u?.name ?? '',
        u?.email ?? '',
        u?.employee_id ?? '',
        new Date(r.submitted_at as string).toLocaleString('es-MX'),
        ...fields.map((f) => String(answers[f.id] ?? '')),
      ];
      rows.push(row);
    }

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const filename = `${(form.title as string).replace(/[^a-z0-9]/gi, '_')}_respuestas.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
