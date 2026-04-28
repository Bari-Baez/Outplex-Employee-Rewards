import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/google/oauth';
import { importGoogleForm } from '@/lib/google/forms';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();

    // Only moderator_a1 and admin (TI) can import Google Forms
    const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).single();
    if (!profile || !['moderator_a1', 'admin'].includes(profile.role as string))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { googleFormId } = await req.json() as { googleFormId: string };
    if (!googleFormId) return NextResponse.json({ error: 'googleFormId required' }, { status: 400 });

    const accessToken = await getValidAccessToken(serviceClient, user.id);
    if (!accessToken) return NextResponse.json({ error: 'Google account not connected.' }, { status: 403 });

    const result = await importGoogleForm(serviceClient, user.id, googleFormId, accessToken);

    return NextResponse.json({
      formId: result.id,
      alreadyExists: result.alreadyExists,
      fieldCount: result.fieldCount,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
