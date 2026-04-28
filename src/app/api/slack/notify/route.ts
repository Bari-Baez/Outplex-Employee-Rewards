import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';

const botToken = process.env.SLACK_BOT_TOKEN;
const userToken = process.env.SLACK_USER_TOKEN;

const slackToken = (botToken && botToken !== 'PENDIENTE' && botToken !== 'PLACEHOLDER')
  ? botToken
  : (userToken && userToken !== 'PENDIENTE' && userToken !== 'PLACEHOLDER' ? userToken : null);

const slack = new WebClient(slackToken || 'NO_TOKEN_CONFIGURED');

export async function POST(request: NextRequest) {
  const { batchName, slotsCount, firstDate, lastDate } = await request.json();

  const channelId = process.env.SLACK_OT_CHANNEL_ID;
  if (!channelId || channelId.includes('PLACEHOLDER') || channelId === 'PENDIENTE') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await slack.chat.postMessage({
      channel: channelId,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚡ NEW OT SLOTS ARE LIVE!',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${batchName ?? 'New OT Batch'}* has just been published!\n\n📅 Dates: *${firstDate}* → *${lastDate}*\n⏰ Total slots: *${slotsCount}*\n\n🔥 Spots are filling fast — don't wait!`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🗓️ Claim Your OT Slot',
                emoji: true,
              },
              style: 'primary',
              url: `${process.env.NEXT_PUBLIC_APP_URL}/ot-calendar`,
              action_id: 'open_ot_calendar',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_First come, first served. Slots update in real-time — no duplicate claims._',
            },
          ],
        },
      ],
      text: `⚡ New OT slots published: ${slotsCount} slots available! Click to claim yours: ${process.env.NEXT_PUBLIC_APP_URL}/ot-calendar`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack] Notification error:', error);
    return NextResponse.json({ error: 'Slack notification failed' }, { status: 500 });
  }
}
