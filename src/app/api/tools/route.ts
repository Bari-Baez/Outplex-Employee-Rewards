import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TOOL_KEYS } from '@/lib/tools-catalog';
import { loadMaintenanceBanner, loadSectionAvailability, loadToolAvailability } from '@/lib/tool-availability';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [tools, sections, banner] = await Promise.all([
      loadToolAvailability(serviceClient, TOOL_KEYS),
      loadSectionAvailability(serviceClient),
      loadMaintenanceBanner(serviceClient),
    ]);

    return NextResponse.json({ tools, sections, banner });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load tool availability.' },
      { status: 500 },
    );
  }
}
