import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { defer, Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenantId = context.switchToHttp().getRequest().user?.tenantId;

    // Nest subscribes after intercept() returns; defer keeps ALS active while
    // the handler and its asynchronous work execute.
    return tenantId ? defer(() => this.tenantContext.run(tenantId, () => next.handle())) : next.handle();
  }
}
