import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private static readonly als = new AsyncLocalStorage<{ tenantId: string }>();

  run(tenantId: string, callback: () => void) {
    return TenantContextService.als.run({ tenantId }, callback);
  }

  getTenantId(): string | undefined {
    return TenantContextService.als.getStore()?.tenantId;
  }
}
