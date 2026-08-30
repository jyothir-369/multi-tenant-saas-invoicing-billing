import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private static readonly als = new AsyncLocalStorage<{ tenantId: string }>();

  run<T>(tenantId: string, callback: () => T | Promise<T>): Promise<T> {
    return TenantContextService.als.run({ tenantId }, async () => {
      return callback();
    });
  }

  getTenantId(): string | undefined {
    return TenantContextService.als.getStore()?.tenantId;
  }
}
