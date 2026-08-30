import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  get client() {
    const tenantId = this.tenantContext.getTenantId();
    
    if (!tenantId) {
      return this;
    }

    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: any; query: Function }) {
            if (['findFirst', 'findMany', 'count', 'update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
              args.where = { ...args.where, tenantId };
            } else if (['create', 'createMany'].includes(operation)) {
              if (Array.isArray(args.data)) {
                args.data = args.data.map((item: any) => ({ ...item, tenantId }));
              } else {
                args.data = { ...args.data, tenantId };
              }
            }
            return query(args);
          },
        },
      },
    }) as this;
  }
}
