import { ForbiddenException, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  async onModuleInit() {
    const timeoutMs = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 10000);
    try {
      await Promise.race([
        this.$connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`database connection timed out after ${timeoutMs}ms`)), timeoutMs)),
      ]);
      this.logger.log('Database connection established');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown database connection error';
      this.logger.error(`Database connection failed: ${message}`);
      throw new Error('Database connection failed. Check DATABASE_URL and database availability.');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  get client() {
    const tenantId = this.tenantContext.getTenantId();
    
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not available');
    }

    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: any; query: Function }) {
            // Tenant is the root record and is accessed by its authenticated tenant id.
            if (model === 'Tenant') {
              return query(args);
            }
            if (['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
              args.where = { ...args.where, tenantId };
              if (['update', 'updateMany', 'upsert'].includes(operation) && args.data) {
                if (Array.isArray(args.data)) {
                  args.data = args.data.map((item: any) => {
                    const { tenantId: _ignored, ...safeData } = item;
                    return safeData;
                  });
                } else {
                  const { tenantId: _ignored, ...safeData } = args.data;
                  args.data = safeData;
                }
              }
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
