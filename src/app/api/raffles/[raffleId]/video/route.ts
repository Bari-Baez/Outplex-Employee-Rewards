import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';
import { isModeratorRole } from '@/lib/auth/roles';
import {
  assertModeratorAccess,
  loadRaffleRuntime,
  persistRaffleRuntime,
} from '@/lib/raffles/server';
import {
  getRaffleVideoDownloadUrl,
  getRaffleVideoStoragePath,
  RAFFLE_VIDEO_BUCKET,
} from '@/lib/raffles/runtime';

async function ensureRaffleVideoBucket(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
) {
  const { data, error } = await supabase.storage.getBucket(RAFFLE_VIDEO_BUCKET);
  if (!error && data) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(RAFFLE_VIDEO_BUCKET, {
    public: false,
    allowedMimeTypes: ['video/webm'],
    fileSizeLimit: '50MB',
  });

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw new Error(createError.message);
  }
}

function buildDownloadFileName(title: string, raffleId: string) {
  const safeTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${safeTitle || 'raffle'}-${raffleId.slice(0, 8)}.webm`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ raffleId: string }> },
) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!profile?.role || !isModeratorRole(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'raffle_engine',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    await assertModeratorAccess(serviceClient, user.id);

    const { raffleId } = await context.params;
    const formData = await request.formData();
    const spinToken = String(formData.get('spinToken') ?? '').trim();
    const file = formData.get('file');

    if (!spinToken) {
      return NextResponse.json({ error: 'spinToken is required.' }, { status: 400 });
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'A raffle video file is required.' }, { status: 400 });
    }

    const runtime = await loadRaffleRuntime(serviceClient, raffleId);
    if (!runtime) {
      return NextResponse.json({ error: 'Raffle runtime not found.' }, { status: 404 });
    }

    if (runtime.phase !== 'spinning' || runtime.currentSpinToken !== spinToken) {
      return NextResponse.json(
        { error: 'This raffle spin is no longer accepting a video proof upload.' },
        { status: 409 },
      );
    }

    await ensureRaffleVideoBucket(serviceClient);

    const storagePath = getRaffleVideoStoragePath(raffleId, spinToken);
    if (runtime.videoProofPath && runtime.videoProofPath !== storagePath) {
      await serviceClient.storage.from(RAFFLE_VIDEO_BUCKET).remove([runtime.videoProofPath]);
    }
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await serviceClient.storage
      .from(RAFFLE_VIDEO_BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || 'video/webm',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const nextRuntime = {
      ...runtime,
      videoProofPath: storagePath,
      videoProofUrl: getRaffleVideoDownloadUrl(raffleId),
      lastUpdatedAt: new Date().toISOString(),
    };

    await persistRaffleRuntime(serviceClient, nextRuntime);

    return NextResponse.json({
      data: {
        downloadUrl: nextRuntime.videoProofUrl,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while saving the raffle video.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ raffleId: string }> },
) {
  try {
    const supabase = await createClient();
    const serviceClient = await createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!profile?.role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: isModeratorRole(profile.role) ? 'raffle_engine' : 'raffles',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    await assertModeratorAccess(serviceClient, user.id);

    const { raffleId } = await context.params;
    const runtime = await loadRaffleRuntime(serviceClient, raffleId);
    if (!runtime?.videoProofPath) {
      return NextResponse.json({ error: 'No saved raffle video is available yet.' }, { status: 404 });
    }

    const { data, error } = await serviceClient.storage
      .from(RAFFLE_VIDEO_BUCKET)
      .download(runtime.videoProofPath);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Unable to download the saved raffle video.' },
        { status: 404 },
      );
    }

    const buffer = await data.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': (data.type || 'video/webm').includes('charset') ? (data.type || 'video/webm') : `${data.type || 'video/webm'}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(buildDownloadFileName(runtime.title, raffleId))}"; filename*=UTF-8''${encodeURIComponent(buildDownloadFileName(runtime.title, raffleId))}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while downloading the raffle video.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
