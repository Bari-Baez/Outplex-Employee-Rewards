import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/google/oauth';
import type { FormField } from '@/lib/forms/types';
import { isFormModeratorRole } from '@/lib/forms/auth';

interface SheetsCreateResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets: Array<{ properties: { title: string } }>;
}
interface SheetsValuesResponse { updatedCells: number }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();

    const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
    if (!profile || !isFormModeratorRole(profile.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { formId } = await req.json() as { formId: string };
    if (!formId) return NextResponse.json({ error: 'formId required' }, { status: 400 });

    const accessToken = await getValidAccessToken(serviceClient, user.id);
    if (!accessToken) return NextResponse.json({ error: 'Google account not connected.' }, { status: 403 });

    // Fetch form + responses
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
    const title = form.title as string;

    // 1. Create spreadsheet
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title: `${title} — Respuestas` },
        sheets: [{ properties: { title: 'Respuestas' } }],
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      return NextResponse.json({ error: `Sheets API error: ${text}` }, { status: createRes.status });
    }

    const createData = await createRes.json() as SheetsCreateResponse;
    const { spreadsheetId, spreadsheetUrl } = createData;
    const sheetTitle = createData.sheets?.[0]?.properties?.title ?? 'Respuestas';

    // 2. Build rows
    const headers = ['Empleado', 'Correo', 'ID Empleado', 'Fecha de envío', ...fields.map((f) => f.label)];
    const dataRows = (responses ?? []).map((r) => {
      const u = r.user as { name?: string; email?: string; employee_id?: string | null } | null;
      const answers = (r.answers ?? {}) as Record<string, unknown>;
      return [
        u?.name ?? '',
        u?.email ?? '',
        u?.employee_id ?? '',
        new Date(r.submitted_at as string).toLocaleString('es-MX'),
        ...fields.map((f) => {
          const val = answers[f.id];
          return Array.isArray(val) ? val.join(', ') : String(val ?? '');
        }),
      ];
    });

    const values = [headers, ...dataRows];

    // 3. Write data
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      return NextResponse.json({ error: `Sheets write error: ${text}` }, { status: updateRes.status });
    }

    const { updatedCells } = await updateRes.json() as SheetsValuesResponse;

    return NextResponse.json({
      spreadsheetId,
      spreadsheetUrl,
      rowsWritten: dataRows.length,
      cellsWritten: updatedCells,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
