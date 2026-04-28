import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { DEFAULT_FORM_SETTINGS } from '@/lib/forms/types';
import { isFormModeratorRole } from '@/lib/forms/auth';

export async function GET() {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serviceClient
      .from('users').select('role').eq('id', user.id).single();

    const isMod = isFormModeratorRole(profile?.role);

    const selectSummary = 'id,title,description,status,published_at,created_at,updated_at,is_mandatory';
    let query = serviceClient.from('forms').select(selectSummary).order('created_at', { ascending: false });
    if (!isMod) query = query.eq('status', 'published');

    const { data: forms, error } = await query;
    if (error) throw new Error(error.message);

    // Append response counts for moderators
    if (isMod && forms) {
      const ids = forms.map((f) => f.id as string);

      const countMap: Record<string, number> = {};
      if (ids.length > 0) {
        try {
          const { data: agg, error: aggErr } = await serviceClient.rpc('get_form_response_counts', { form_ids: ids });
          if (aggErr) throw aggErr;
          for (const row of (agg ?? []) as Array<{ form_id: string; response_count: number }>) {
            countMap[row.form_id] = row.response_count ?? 0;
          }
        } catch {
          // Fallback: count on the app side if RPC isn't installed yet.
          const { data: counts } = await serviceClient.from('form_responses').select('form_id').in('form_id', ids);
          for (const row of counts ?? []) {
            const fid = row.form_id as string;
            countMap[fid] = (countMap[fid] ?? 0) + 1;
          }
        }
      }

      return NextResponse.json({
        data: forms.map((f) => ({ ...f, responseCount: countMap[f.id as string] ?? 0 })),
      });
    }

    return NextResponse.json({ data: forms ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error loading forms.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await serviceClient
      .from('users').select('role').eq('id', user.id).single();
    if (!profile || !isFormModeratorRole(profile.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = (await request.json()) as { title?: string; description?: string };
    const title = body.title?.trim() ?? '';
    if (!title) return NextResponse.json({ error: 'El título del formulario es requerido.' }, { status: 400 });

    const { data: form, error } = await serviceClient
      .from('forms')
      .insert({
        title,
        description: body.description?.trim() ?? '',
        fields: [],
        settings: DEFAULT_FORM_SETTINGS,
        status: 'draft',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ data: form });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error creating form.' }, { status: 500 });
  }
}
