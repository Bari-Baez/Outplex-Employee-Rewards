import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TOOL_KEYS, type ToolKey } from '@/lib/tools-catalog';
import { TOOL_SECTION_IDS } from '@/lib/tool-sections-catalog';
import {
  loadMaintenanceBanner,
  loadSectionAvailability,
  loadToolAvailability,
  upsertMaintenanceBanner,
  upsertSectionAvailability,
  upsertToolAvailability,
  type MaintenanceBannerState,
  type SectionAvailabilityMap,
  type ToolAvailabilityMap,
} from '@/lib/tool-availability';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error } = await serviceClient
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { serviceClient };
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  try {
    const [tools, sections, banner] = await Promise.all([
      loadToolAvailability(auth.serviceClient, TOOL_KEYS),
      loadSectionAvailability(auth.serviceClient),
      loadMaintenanceBanner(auth.serviceClient),
    ]);

    return NextResponse.json({ tools, sections, banner });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load admin tools.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      toolUpdates?: Partial<Record<ToolKey, boolean>>;
      sectionUpdates?: Partial<Record<string, boolean>>;
      banner?: MaintenanceBannerState;
    };

    if (body.toolUpdates) {
      // Guard against unknown tool keys.
      const filtered: Partial<ToolAvailabilityMap> = {};
      for (const key of TOOL_KEYS) {
        if (typeof body.toolUpdates[key] === 'boolean') {
          filtered[key] = body.toolUpdates[key] as boolean;
        }
      }
      await upsertToolAvailability(auth.serviceClient, filtered);
    }

    if (body.sectionUpdates) {
      const filtered: Partial<SectionAvailabilityMap> = {};
      for (const id of TOOL_SECTION_IDS) {
        if (typeof body.sectionUpdates[id] === 'boolean') {
          filtered[id] = body.sectionUpdates[id] as boolean;
        }
      }
      await upsertSectionAvailability(auth.serviceClient, filtered);
    }

    if (body.banner) {
      await upsertMaintenanceBanner(auth.serviceClient, {
        active: Boolean(body.banner.active),
        message: String(body.banner.message ?? ''),
      });
    }

    const [tools, sections, banner] = await Promise.all([
      loadToolAvailability(auth.serviceClient, TOOL_KEYS),
      loadSectionAvailability(auth.serviceClient),
      loadMaintenanceBanner(auth.serviceClient),
    ]);

    return NextResponse.json({ tools, sections, banner });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update admin tools.' },
      { status: 500 },
    );
  }
}
