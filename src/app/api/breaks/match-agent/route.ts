import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { manuallyMatchAgent } from '@/lib/breaks-server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

export async function POST(req: NextRequest) {
  try {
    const service = await createServiceClient();
    
    // Check auth
    const { data: { user: authUser } } = await service.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: dbUser } = await service
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single();

    if (!dbUser || !['admin', 'moderator_a1'].includes(dbUser.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: service,
      toolKey: 'breaks_manager',
      sectionKey: 'main',
      userRole: dbUser.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const { batchId, rawName, userId } = await req.json();

    if (!batchId || !rawName || !userId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const result = await manuallyMatchAgent({ batchId, rawName, userId });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[MATCH_AGENT_ERROR]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Match failed' },
      { status: 500 },
    );
  }
}
