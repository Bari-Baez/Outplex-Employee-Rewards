import { NextResponse } from 'next/server';
import { getWorkspaceInfo } from '@/lib/slack/oauth';

/**
 * GET /api/slack/workspace
 * Returns workspace info if the bot token is configured.
 * Used by the login page to show which workspace is connected.
 */
export async function GET() {
  try {
    const workspace = await getWorkspaceInfo();

    if (!workspace) {
      return NextResponse.json({ configured: false });
    }

    return NextResponse.json({ configured: true, workspace });
  } catch {
    return NextResponse.json({ configured: false });
  }
}
