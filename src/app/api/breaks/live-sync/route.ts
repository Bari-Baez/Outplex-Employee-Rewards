import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { processFileBuffer, sha256 } from '@backend/modules/breaks/domain/schedule';
import { createScheduleBatchAndSchedules } from '@backend/modules/breaks/application/schedule-service';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';

/**
 * POST /api/breaks/live-sync
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'moderator_a1', 'moderator_b1'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = await createServiceClient();
  const maintenance = await enforceSectionAvailability({
    serviceClient: service,
    toolKey: 'breaks_manager',
    sectionKey: 'main',
    userRole: profile.role as string,
    bypassForAdmin: true,
  });
  if (maintenance) {
    return maintenance;
  }

  const tenantId     = process.env.MS_GRAPH_TENANT_ID;
  const clientId     = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const siteId       = process.env.MS_GRAPH_SITE_ID;
  const driveId      = process.env.MS_GRAPH_DRIVE_ID;
  const itemId       = process.env.MS_GRAPH_ITEM_ID;

  if (!tenantId || !clientId || !clientSecret || !siteId || !driveId || !itemId) {
    return NextResponse.json({ 
        error: 'Missing Microsoft Graph API credentials. Integration is pending environment setup.',
        requireConfig: true
    }, { status: 503 });
  }

  try {
    // 1. Get Access Token (Client Credentials Flow)
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: clientSecret,
            grant_type: 'client_credentials'
        })
    });
    
    if (!tokenResponse.ok) {
        throw new Error('Could not authenticate with Azure. Verify TenantID, ClientID, and Secret.');
    }

    const { access_token } = await tokenResponse.json();

    // 2. Fetch the file content from Graph API
    const fileResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${itemId}/content`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (!fileResponse.ok) {
        throw new Error('Failed to download the schedule from SharePoint. Verify Site/Drive/Item IDs.');
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    
    // 3. Process with unified toolset
    const fileName = 'AutoSync_Schedule.xlsx'; // Canonical name for live syncs
    const { rows: parsedRows, errors: parseErrors } = await processFileBuffer(arrayBuffer, fileName);

    if (parseErrors.length > 0 && parsedRows.length === 0) {
      throw new Error(`Parse failed: ${parseErrors[0]}`);
    }

    // 4. Create Batch & Schedules
    const fileHash = await sha256(new TextDecoder().decode(arrayBuffer.slice(0, 5000)) + fileName + arrayBuffer.byteLength);

    const resultBatch = await createScheduleBatchAndSchedules({
      parsedRows,
      uploadedBy: user.id,
      sourceType: 'live',
      fileHash,
      forceReplace: true, // Auto-sync always replaces for the same hash/day
    });

    return NextResponse.json({ 
        success: true, 
        message: 'Successfully synchronized from Microsoft 365.',
        batchId: resultBatch.batchId,
        matched: resultBatch.matchedCount,
        pendingReviewCount: resultBatch.pendingReview.length
    });

  } catch (error) {
    console.error('LIVE SYNC ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred during live sync.' },
      { status: 500 },
    );
  }
}
