import { NextResponse } from 'next/server';
import { getSlackTeamProfile } from '@/lib/slack/oauth';

/**
 * GET /api/slack/fields
 * Diagnostic endpoint to list custom profile fields from the Slack workspace.
 * Helps identify the ID for the "Employee ID" field.
 */
export async function GET() {
  try {
    const profile = await getSlackTeamProfile();

    if (!profile) {
      return NextResponse.json({ 
        error: 'Could not fetch Slack workspace profile. Check if SLACK_BOT_TOKEN is valid and has users.profile:read scope.' 
      }, { status: 500 });
    }

    return NextResponse.json({ fields: profile.fields });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to load Slack fields.' },
      { status: 500 },
    );
  }
}
