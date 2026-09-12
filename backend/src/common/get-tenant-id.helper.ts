import { Request } from 'express';

interface AuthUser {
  tenantId?: string;
  tenant?: { id?: string };
}

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  user?: AuthUser;
}

/**
 * Extracts the tenant_id from the JWT on the request.
 * Never trust the client — tenant scoping is always derived from auth.
 */
export function getTenantIdFromRequest(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.user?.tenantId ?? authReq.user?.tenant?.id ?? authReq.tenantId;
  if (!tenantId) {
    throw new Error('Tenant ID not found in request');
  }
  return tenantId;
}