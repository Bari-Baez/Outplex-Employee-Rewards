import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@backend/platform/supabase/server';
import { getValidAccessToken } from '@backend/platform/integrations/google/oauth';

interface GoogleDriveFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
}

interface GoogleDriveListResponse {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const accessToken = await getValidAccessToken(serviceClient, user.id);
    if (!accessToken) return NextResponse.json({ error: 'Google account not connected.' }, { status: 403 });

    // List Google Forms via Drive API (mimeType filter)
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.form'",
      fields: 'files(id,name,createdTime,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: '50',
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Google API error: ${text}` }, { status: res.status });
    }

    const data = await res.json() as GoogleDriveListResponse;
    return NextResponse.json({ forms: data.files ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error.' }, { status: 500 });
  }
}
