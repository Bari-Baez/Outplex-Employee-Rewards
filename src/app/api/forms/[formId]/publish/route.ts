import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { isFormModeratorRole } from '@backend/modules/forms/domain/authorization';

type Ctx = { params: Promise<{ formId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
    if (!profile || !isFormModeratorRole(profile.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { formId } = await ctx.params;
    const { data: form } = await serviceClient.from('forms').select('status').eq('id', formId).single();
    if (!form) return NextResponse.json({ error: 'Form not found.' }, { status: 404 });

    const currentStatus = form.status as string;
    let nextStatus: string;
    let publishedAt: string | null;

    if (currentStatus === 'published') {
      nextStatus = 'closed';
      publishedAt = null;
    } else {
      nextStatus = 'published';
      publishedAt = new Date().toISOString();
    }

    const { data: updated, error } = await serviceClient
      .from('forms')
      .update({ status: nextStatus, published_at: publishedAt })
      .eq('id', formId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
