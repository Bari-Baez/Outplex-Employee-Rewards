import type { SupportTicket, UserRole } from '@shared/contracts/database';
import type { CreateSupportTicketInput, SupportDepartment, SupportTicketStatus } from '@backend/modules/support/contracts/ticket';

export interface SupportTicketRepository {
  findLatestCreatedAt(userId: string): Promise<string | null>;
  create(userId: string, input: CreateSupportTicketInput & { subject: string }): Promise<SupportTicket>;
  findDepartment(ticketId: string): Promise<SupportDepartment | null>;
  findUserRole(userId: string): Promise<UserRole | null>;
  updateStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket>;
}
