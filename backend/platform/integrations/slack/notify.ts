import 'server-only';

import { WebClient } from '@slack/web-api';
import { getAppOrigin, getOptionalServerEnv } from '@backend/platform/config/server-env';

export type OtSlotsNotification = {
  batchName: string;
  slotsCount: number;
  firstDate: string;
  lastDate: string;
};

function escapeSlackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function assertValidNotification(input: OtSlotsNotification): void {
  if (!input.batchName || input.batchName.length > 120) throw new Error('Invalid Slack notification batch name.');
  if (!Number.isSafeInteger(input.slotsCount) || input.slotsCount < 1 || input.slotsCount > 100_000) {
    throw new Error('Invalid Slack notification slot count.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.lastDate)) {
    throw new Error('Invalid Slack notification date range.');
  }
}

export async function notifyOtSlotsPublished(
  input: OtSlotsNotification,
): Promise<{ skipped: boolean }> {
  assertValidNotification(input);

  const token = getOptionalServerEnv('SLACK_BOT_TOKEN') ?? getOptionalServerEnv('SLACK_USER_TOKEN');
  const channelId = getOptionalServerEnv('SLACK_OT_CHANNEL_ID');
  if (!token || !channelId) return { skipped: true };
  if (/^C0X+$/i.test(channelId)) return { skipped: true };
  if (!/^[CG][A-Z0-9]{8,}$/.test(channelId)) {
    throw new Error('Invalid Slack channel configuration.');
  }

  const appOrigin = getAppOrigin();
  const calendarUrl = new URL('/ot-calendar', appOrigin).toString();
  const batchName = escapeSlackText(input.batchName);
  const firstDate = escapeSlackText(input.firstDate);
  const lastDate = escapeSlackText(input.lastDate);
  const slack = new WebClient(token, { timeout: 10_000 });

  await slack.chat.postMessage({
    channel: channelId,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⚡ NEW OT SLOTS ARE LIVE!', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${batchName}* has just been published!\n\n📅 Dates: *${firstDate}* → *${lastDate}*\n⏰ Total slots: *${input.slotsCount}*\n\n🔥 Spots are filling fast — don't wait!`,
        },
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: '🗓️ Claim Your OT Slot', emoji: true },
          style: 'primary',
          url: calendarUrl,
          action_id: 'open_ot_calendar',
        }],
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '_First come, first served. Slots update in real-time — no duplicate claims._',
        }],
      },
    ],
    text: `New OT slots published: ${input.slotsCount} slots available. ${calendarUrl}`,
  });

  return { skipped: false };
}
