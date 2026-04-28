import { NextResponse } from 'next/server';
import type { ToolKey } from '@/lib/tools-catalog';
import { getSectionEnabledSettingKey, getToolEnabledSettingKey, parseBooleanSetting } from '@/lib/tool-availability';
import type { SupabaseClient } from '@supabase/supabase-js';

type ServiceClient = SupabaseClient;

export async function enforceSectionAvailability({
  serviceClient,
  toolKey,
  sectionKey,
  userRole,
  bypassForAdmin = true,
}: {
  serviceClient: ServiceClient;
  toolKey: ToolKey;
  sectionKey: string;
  userRole: string;
  bypassForAdmin?: boolean;
}) {
  if (bypassForAdmin && userRole === 'admin') {
    return null;
  }

  const toolEnabledKey = getToolEnabledSettingKey(toolKey);
  const sectionEnabledKey = getSectionEnabledSettingKey(toolKey, sectionKey);

  const { data, error } = await serviceClient
    .from('app_settings')
    .select('key, value')
    .in('key', [toolEnabledKey, sectionEnabledKey]);

  if (error) {
    return NextResponse.json({ error: 'Unable to validate maintenance mode.' }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ key: unknown; value: unknown }>;
  const map = new Map<string, unknown>(rows.map((row) => [String(row.key), row.value]));
  const toolEnabled = parseBooleanSetting(map.get(toolEnabledKey));
  const sectionEnabled = parseBooleanSetting(map.get(sectionEnabledKey));

  if (toolEnabled === false || sectionEnabled === false) {
    return NextResponse.json(
      {
        error: 'Maintenance',
        maintenance: { toolKey, sectionKey },
      },
      { status: 503 },
    );
  }

  return null;
}
