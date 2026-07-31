import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { isModeratorRole } from '@backend/modules/access/domain/roles';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

async function requireModeratorOrAdmin() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !isModeratorRole(profile.role)) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'ot_staging',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return { error: maintenance };
  }

  return { serviceClient };
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  const auth = await requireModeratorOrAdmin();
  if ('error' in auth) {
    return auth.error;
  }

  const { draftId } = await context.params;
  const { serviceClient } = auth;

  await serviceClient.from('ot_slots').delete().eq('batch_id', draftId);

  const { error } = await serviceClient.from('ot_batches').delete().eq('id', draftId).eq('status', 'draft');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Draft deleted successfully.' });
}
