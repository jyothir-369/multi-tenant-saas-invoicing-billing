import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private static readonly als = new AsyncLocalStorage<{ tenantId: string }>();

  run<T>(tenantId: string, callback: () => T): T {
    if (!tenantId?.trim()) throw new Error('Tenant id is required');

    return TenantContextService.als.run({ tenantId }, callback);
  }

  getTenantId(): string | undefined {
    return TenantContextService.als.getStore()?.tenantId;
  }
}
