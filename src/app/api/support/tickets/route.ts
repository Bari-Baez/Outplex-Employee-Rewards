import { createClient } from '@backend/platform/supabase/server';
import { createSupportTicket } from '@backend/modules/support/application/create-ticket';
import { SupportApplicationError } from '@backend/modules/support/application/errors';
import { createSupportTicketSchema } from '@backend/modules/support/contracts/ticket';
import { SupabaseSupportTicketRepository } from '@backend/modules/support/infrastructure/supabase-support-repository';
import { readJsonObject, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, jsonResponse } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return errorResponse(requestId, 401, 'Unauthorized');

    const parsed = createSupportTicketSchema.safeParse(await readJsonObject(request, 8 * 1_024));
    if (!parsed.success) {
      const departmentInvalid = parsed.error.issues.some((issue) => issue.path[0] === 'department');
      return errorResponse(
        requestId,
        400,
        departmentInvalid
          ? 'Choose a valid support category.'
          : 'Write a message before sending your ticket.',
      );
    }

    const repository = new SupabaseSupportTicketRepository(supabase);
    const data = await createSupportTicket(repository, user.id, parsed.data);
    return jsonResponse(requestId, { data });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    if (error instanceof SupportApplicationError) {
      return errorResponse(requestId, error.status, error.publicMessage, { code: error.code });
    }
    logServerError('support.create-ticket', requestId, error);
    return errorResponse(requestId, 500, 'Unable to create the support ticket.');
  }
}
