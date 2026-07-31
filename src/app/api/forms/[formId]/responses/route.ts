import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { validateFormAnswers } from '@backend/modules/forms/domain/validation';
import type { FormField } from '@backend/modules/forms/contracts/form';
import { isFormModeratorRole } from '@backend/modules/forms/domain/authorization';

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
    const { data: responses, error } = await serviceClient
      .from('form_responses')
      .select('*, user:users(id, name, email, employee_id, role)')
      .eq('form_id', formId)
      .order('submitted_at', { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ data: responses ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { formId } = await ctx.params;

    const { data: form } = await serviceClient
      .from('forms').select('id,status,settings,fields').eq('id', formId).single();
    if (!form) return NextResponse.json({ error: 'Formulario no encontrado.' }, { status: 404 });
    if (form.status !== 'published')
      return NextResponse.json({ error: 'Este formulario no está disponible.' }, { status: 400 });

    // Check for existing response (unless multiple submissions allowed)
    const settings = form.settings as { allowMultipleSubmissions?: boolean };
    if (!settings.allowMultipleSubmissions) {
      const { data: existing } = await serviceClient
        .from('form_responses')
        .select('id')
        .eq('form_id', formId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing)
        return NextResponse.json({ error: 'Ya enviaste una respuesta para este formulario.' }, { status: 409 });
    }

    const body = (await request.json()) as { answers?: Record<string, unknown> };
    const answers = body.answers ?? {};

    // Server-side validation
    const fields = (form.fields as FormField[]) ?? [];
    const errors = validateFormAnswers(fields, answers);
    if (Object.keys(errors).length > 0)
      return NextResponse.json({ error: 'Hay campos inválidos.', fieldErrors: errors }, { status: 422 });

    const { data: response, error } = await serviceClient
      .from('form_responses')
      .insert({ form_id: formId, user_id: user.id, answers })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ data: response });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
