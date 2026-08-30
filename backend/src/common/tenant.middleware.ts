import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // In a real app, you'd extract this from the JWT or a header
    // For now, we'll assume it's attached to the user object by the AuthGuard
    const tenantId = (req as any).user?.tenantId;

    if (tenantId) {
      this.tenantContextService.run(tenantId, () => next());
    } else {
      next();
    }
  }
}
