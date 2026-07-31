import 'server-only';

import { randomUUID } from 'node:crypto';
import { createServiceClient } from '@backend/platform/supabase/server';
import { enforceSectionAvailability } from '@backend/modules/shell/application/section-guard';
import { authorizeCapability, hasCapability, type Capability } from '@backend/platform/auth/capabilities';
import { getAppOrigin } from '@backend/platform/config/server-env';
import { validateFile, type SafeFileKind } from '@backend/platform/http/file-validation';
import { isSameOriginRequest } from '@backend/platform/http/redirects';
import { readMultipartFormData, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, jsonResponse, rateLimitedResponse, withRequestId } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 1024 * 1024;
const IMAGE_KINDS = ['gif', 'jpeg', 'png', 'webp'] as const satisfies readonly SafeFileKind[];

const FOLDERS: Record<string, { capability: Capability; kinds: readonly SafeFileKind[] }> = {
  uploads: { capability: 'assets:upload:self-service', kinds: [...IMAGE_KINDS, 'pdf', 'csv', 'xls', 'xlsx'] },
  avatars: { capability: 'assets:upload:self-service', kinds: IMAGE_KINDS },
  emp_store: { capability: 'assets:upload:self-service', kinds: IMAGE_KINDS },
  products: { capability: 'assets:upload:managed', kinds: IMAGE_KINDS },
  public: { capability: 'assets:upload:managed', kinds: [...IMAGE_KINDS, 'pdf'] },
  store: { capability: 'assets:upload:managed', kinds: IMAGE_KINDS },
  forms: { capability: 'assets:upload:managed', kinds: IMAGE_KINDS },
  raffles: { capability: 'assets:upload:managed', kinds: IMAGE_KINDS },
  breaks: { capability: 'assets:upload:managed', kinds: ['csv', 'xls', 'xlsx'] },
};

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    if (!isSameOriginRequest(request, getAppOrigin())) {
      return errorResponse(requestId, 403, 'Forbidden');
    }

    const auth = await authorizeCapability('assets:upload:self-service');
    if (!auth.ok) return errorResponse(requestId, auth.status, auth.error);

    const rateLimit = await consumeRateLimit({
      scope: 'assets:upload',
      subject: auth.profile.id,
      limit: 30,
      windowSeconds: 60,
      requestId,
    });
    if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit.retryAfterSeconds);

    const formData = await readMultipartFormData(request, MAX_MULTIPART_BYTES);
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return errorResponse(requestId, 400, 'No file provided');
    }
    if (file.size > MAX_FILE_BYTES) {
      return errorResponse(requestId, 413, 'File too large (max 10MB)');
    }

    const rawFolder = formData.get('folder');
    if (rawFolder !== null && typeof rawFolder !== 'string') {
      return errorResponse(requestId, 400, 'Invalid upload folder');
    }
    const folder = rawFolder?.trim() || 'uploads';
    const folderPolicy = FOLDERS[folder];
    if (!folderPolicy || !hasCapability(auth.profile.role, folderPolicy.capability)) {
      return errorResponse(requestId, 403, 'Forbidden');
    }

    const validated = await validateFile(file, {
      maxBytes: MAX_FILE_BYTES,
      allowedKinds: folderPolicy.kinds,
    });
    if (!validated) {
      return errorResponse(requestId, 400, 'File type not allowed or file content is invalid');
    }

    const serviceClient = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient,
      toolKey: 'my_store',
      sectionKey: 'main',
      userRole: auth.profile.role,
      bypassForAdmin: true,
    });
    if (maintenance) return withRequestId(maintenance, requestId);

    const ownerSegment = folderPolicy.capability === 'assets:upload:self-service'
      ? `/${auth.profile.id}`
      : '';
    const filePath = `${folder}${ownerSegment}/${randomUUID()}.${validated.extension}`;
    const { data, error } = await serviceClient.storage
      .from('assets')
      .upload(filePath, validated.bytes, {
        contentType: validated.contentType,
        upsert: false,
      });

    if (error || !data) {
      logServerError('upload.storage', requestId, error);
      return errorResponse(requestId, 500, 'Unable to store file');
    }

    const { data: publicUrlData } = serviceClient.storage.from('assets').getPublicUrl(data.path);
    return jsonResponse(requestId, { url: publicUrlData.publicUrl });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    logServerError('upload', requestId, error);
    return errorResponse(requestId, 500, 'Internal Server Error');
  }
}
