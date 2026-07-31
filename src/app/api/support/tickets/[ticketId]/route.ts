import { createClient } from '@/lib/supabase/server';
import { SupportApplicationError } from '@/modules/support/application/errors';
import { updateSupportTicketStatus } from '@/modules/support/application/update-ticket-status';
import { supportTicketIdSchema, updateSupportTicketSchema } from '@/modules/support/contracts/ticket';
import { SupabaseSupportTicketRepository } from '@/modules/support/infrastructure/supabase-support-repository';
import { readJsonObject, RequestBodyError } from '@/platform/http/request-body';
import { errorResponse, jsonResponse } from '@/platform/http/responses';
import { getRequestId, logServerError } from '@/platform/observability/request-context';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const requestId = getRequestId(request);
  try {
    const [{ ticketId }, body] = await Promise.all([
      params,
      readJsonObject(request, 4 * 1_024),
    ]);
    const parsedTicketId = supportTicketIdSchema.safeParse(ticketId);
    const parsedBody = updateSupportTicketSchema.safeParse(body);
    if (!parsedTicketId.success) {
      return errorResponse(requestId, 400, 'Invalid ticket identifier.');
    }
    if (!parsedBody.success) {
      return errorResponse(requestId, 400, 'Invalid ticket status.');
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return errorResponse(requestId, 401, 'Unauthorized');

    const repository = new SupabaseSupportTicketRepository(supabase);
    const data = await updateSupportTicketStatus(
      repository,
      user.id,
      parsedTicketId.data,
      parsedBody.data.status,
    );
    return jsonResponse(requestId, { data });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    if (error instanceof SupportApplicationError) {
      return errorResponse(requestId, error.status, error.publicMessage, { code: error.code });
    }
    logServerError('support.update-ticket', requestId, error);
    return errorResponse(requestId, 500, 'Unable to update ticket status.');
  }
}
