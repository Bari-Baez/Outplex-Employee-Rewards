import type { SupportTicket } from '@shared/contracts/database';
import type { SupportTicketStatus } from '@backend/modules/support/contracts/ticket';
import { canManageSupportDepartment } from '@backend/modules/support/domain/ticket-policy';
import { SupportApplicationError } from '@backend/modules/support/application/errors';
import type { SupportTicketRepository } from '@backend/modules/support/application/ports';

export async function updateSupportTicketStatus(
  repository: SupportTicketRepository,
  actorId: string,
  ticketId: string,
  status: SupportTicketStatus,
): Promise<SupportTicket> {
  const [role, department] = await Promise.all([
    repository.findUserRole(actorId),
    repository.findDepartment(ticketId),
  ]);

  if (!role || !['moderator_a1', 'moderator_b1', 'admin'].includes(role)) {
    throw new SupportApplicationError(403, 'Forbidden', 'support_forbidden');
  }
  if (!department) {
    throw new SupportApplicationError(404, 'Ticket not found.', 'support_ticket_not_found');
  }
  if (!canManageSupportDepartment(role, department)) {
    throw new SupportApplicationError(
      403,
      'Moderators can only manage moderator tickets.',
      'support_department_forbidden',
    );
  }

  return repository.updateStatus(ticketId, status);
}
