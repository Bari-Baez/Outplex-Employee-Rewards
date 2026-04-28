import { NextResponse } from 'next/server';
import { normalizeStoreThemeConfig, STORE_THEME_KEY } from '@/lib/store-helpers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { StoreThemeConfig } from '@/types/database';
import { isModeratorRole } from '@/lib/auth/roles';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

async function getAuthorizedModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !isModeratorRole(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, role: profile.role as string };
}

export async function PATCH(req: Request) {
  const auth = await getAuthorizedModerator();
  if (auth.error) {
    return auth.error;
  }

  const body = (await req.json()) as { theme?: StoreThemeConfig };
  if (!body.theme) {
    return NextResponse.json({ error: 'Missing theme payload.' }, { status: 400 });
  }

  const theme = normalizeStoreThemeConfig(body.theme);
  const serviceClient = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: serviceClient,
    toolKey: 'store_operations',
    sectionKey: 'theme',
    userRole: auth.role,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }
  const { error } = await serviceClient.from('app_settings').upsert(
    {
      key: STORE_THEME_KEY,
      value: theme,
    },
    { onConflict: 'key' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ theme });
}
