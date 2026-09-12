import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { getTenantIdFromRequest } from '../get-tenant-id.helper';

@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const controller = this.reflector.getAllAndOverride<string>('controller', [
      context.getClass(),
      context.getHandler(),
    ]);

    // Extract tenant_id from JWT via the helper
    const tenantId = getTenantIdFromRequest(request);

    // Ensure the tenant_id is present and valid
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }

    // Attach tenant_id to request for use in services
    request.tenantId = tenantId;

    return true;
  }
}