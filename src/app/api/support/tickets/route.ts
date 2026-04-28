import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupportDepartment, SupportTicket } from '@/types/database';

const TICKET_COOLDOWN_MS = 5 * 60 * 60 * 1000;

function isDepartment(value: string): value is SupportDepartment {
  return value === 'it' || value === 'moderator';
}

function buildSupportSubject(department: SupportDepartment, message: string) {
  const prefix = department === 'it' ? 'IT Support' : 'Moderator Support';
  const normalized = message.replace(/\s+/g, ' ').trim();
  return `${prefix}: ${normalized.slice(0, 72)}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      department?: string;
      message?: string;
    };

    if (!body.department || !isDepartment(body.department)) {
      return NextResponse.json({ error: 'Choose a valid support category.' }, { status: 400 });
    }

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: 'Write a message before sending your ticket.' }, { status: 400 });
    }

    const { data: lastTicket } = await supabase
      .from('support_tickets')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastTicket?.created_at) {
      const lastTicketTime = new Date(lastTicket.created_at).getTime();
      const msRemaining = TICKET_COOLDOWN_MS - (Date.now() - lastTicketTime);

      if (msRemaining > 0) {
        const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));
        return NextResponse.json(
          {
            error: `You can create another ticket in about ${hoursRemaining} hour(s).`,
          },
          { status: 429 },
        );
      }
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        department: body.department,
        subject: buildSupportSubject(body.department, message),
        message,
        status: 'open',
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Unable to create the support ticket.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data as SupportTicket });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error while creating the support ticket.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
