import type { SupportTicket, UserRole } from '@/types/database';
import type { CreateSupportTicketInput, SupportDepartment, SupportTicketStatus } from '../contracts/ticket';

export interface SupportTicketRepository {
  findLatestCreatedAt(userId: string): Promise<string | null>;
  create(userId: string, input: CreateSupportTicketInput & { subject: string }): Promise<SupportTicket>;
  findDepartment(ticketId: string): Promise<SupportDepartment | null>;
  findUserRole(userId: string): Promise<UserRole | null>;
  updateStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket>;
}
