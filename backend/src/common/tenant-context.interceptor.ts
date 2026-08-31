import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenantId = context.switchToHttp().getRequest().user?.tenantId;

    return tenantId
      ? this.tenantContext.run(tenantId, () => next.handle())
      : next.handle();
  }
}