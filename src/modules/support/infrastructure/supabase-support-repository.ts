import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import type { SupportTicket, UserRole } from '@/types/database';
import type { CreateSupportTicketInput, SupportDepartment, SupportTicketStatus } from '../contracts/ticket';
import { SupportApplicationError } from '../application/errors';
import type { SupportTicketRepository } from '../application/ports';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export class SupabaseSupportTicketRepository implements SupportTicketRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findLatestCreatedAt(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw this.infrastructureError();
    return data?.created_at ?? null;
  }

  async create(
    userId: string,
    input: CreateSupportTicketInput & { subject: string },
  ): Promise<SupportTicket> {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        department: input.department,
        subject: input.subject,
        message: input.message,
        status: 'open',
      })
      .select('*')
      .single();

    if (error || !data) throw this.infrastructureError();
    return data as SupportTicket;
  }

  async findDepartment(ticketId: string): Promise<SupportDepartment | null> {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .select('department')
      .eq('id', ticketId)
      .maybeSingle();

    if (error) throw this.infrastructureError();
    return (data?.department as SupportDepartment | undefined) ?? null;
  }

  async findUserRole(userId: string): Promise<UserRole | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw this.infrastructureError();
    return (data?.role as UserRole | undefined) ?? null;
  }

  async updateStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket> {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .update({ status })
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error || !data) throw this.infrastructureError();
    return data as SupportTicket;
  }

  private infrastructureError(): SupportApplicationError {
    return new SupportApplicationError(
      500,
      'Unable to complete the support request.',
      'support_infrastructure_error',
    );
  }
}
