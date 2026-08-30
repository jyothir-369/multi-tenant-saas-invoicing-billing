import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextService } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Global()
@Module({
  providers: [TenantContextService, { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor }],
  exports: [TenantContextService],
})
export class CommonModule {}
