import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { FormField, FormSettings } from '@/lib/forms/types';
import { isFormModeratorRole } from '@/lib/forms/auth';

type Ctx = { params: Promise<{ formId: string }> };

async function assertMod(supabase: Awaited<ReturnType<typeof createClient>>, serviceClient: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', userId).single();
  if (!profile || !isFormModeratorRole(profile.role))
    throw Object.assign(new Error('Forbidden'), { status: 403 });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { formId } = await ctx.params;
    const { data: form, error } = await serviceClient
      .from('forms').select('*').eq('id', formId).single();
    if (error || !form) return NextResponse.json({ error: 'Form not found.' }, { status: 404 });

    return NextResponse.json({ data: form });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await assertMod(supabase, serviceClient, user.id);

    const { formId } = await ctx.params;
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      fields?: FormField[];
      settings?: FormSettings;
      status?: string;
      is_mandatory?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title.trim();
    if (body.description !== undefined) patch.description = body.description.trim();
    if (body.fields !== undefined) patch.fields = body.fields;
    if (body.settings !== undefined) patch.settings = body.settings;
    if (body.status !== undefined && ['draft', 'published', 'closed'].includes(body.status))
      patch.status = body.status;
    if (body.is_mandatory !== undefined) patch.is_mandatory = body.is_mandatory;

    const { data: form, error } = await serviceClient
      .from('forms').update(patch).eq('id', formId).select('*').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: form });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await assertMod(supabase, serviceClient, user.id);

    const { formId } = await ctx.params;
    const { error } = await serviceClient.from('forms').delete().eq('id', formId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status });
  }
}
