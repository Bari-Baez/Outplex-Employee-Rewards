import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupportDepartment, SupportTicketStatus } from '@/types/database';

function isValidStatus(value: string): value is SupportTicketStatus {
  return value === 'open' || value === 'in_progress' || value === 'resolved';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['moderator_a1', 'moderator_b1', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      status?: string;
    };

    if (!body.status || !isValidStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid ticket status.' }, { status: 400 });
    }

    const { data: ticket } = await supabase
      .from('support_tickets')
      .select('department')
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    const department = ticket.department as SupportDepartment;
    if ((profile.role === 'moderator_a1' || profile.role === 'moderator_b1') && department !== 'moderator') {
      return NextResponse.json({ error: 'Moderators can only manage moderator tickets.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status: body.status })
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Unable to update ticket status.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected support update error.' },
      { status: 500 },
    );
  }
}
