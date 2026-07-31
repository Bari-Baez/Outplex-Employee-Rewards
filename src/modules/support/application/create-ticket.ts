import type { SupportTicket } from '@/types/database';
import type { CreateSupportTicketInput } from '../contracts/ticket';
import { buildSupportSubject, supportCooldownHours } from '../domain/ticket-policy';
import { SupportApplicationError } from './errors';
import type { SupportTicketRepository } from './ports';

export async function createSupportTicket(
  repository: SupportTicketRepository,
  actorId: string,
  input: CreateSupportTicketInput,
  now = new Date(),
): Promise<SupportTicket> {
  const lastCreatedAt = await repository.findLatestCreatedAt(actorId);
  const hoursRemaining = supportCooldownHours(lastCreatedAt, now);
  if (hoursRemaining !== null) {
    throw new SupportApplicationError(
      429,
      `You can create another ticket in about ${hoursRemaining} hour(s).`,
      'support_ticket_cooldown',
    );
  }

  return repository.create(actorId, {
    ...input,
    subject: buildSupportSubject(input.department, input.message),
  });
}
