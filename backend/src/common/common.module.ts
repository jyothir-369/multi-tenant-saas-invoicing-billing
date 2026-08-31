import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextService } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';

@Global()
@Module({
  providers: [
    TenantContextService,
    RateLimitService,
    RateLimitGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
  exports: [
    TenantContextService,
    RateLimitService,
    RateLimitGuard,
  ],
})
export class CommonModule {}