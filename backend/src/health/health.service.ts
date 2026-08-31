import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const checks = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);
    const [postgres, redis] = checks;
    return {
      status: postgres && redis ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies: { postgres: postgres ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    };
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await Promise.race([
        this.prisma.$queryRawUnsafe('SELECT 1'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('database health check timed out')), 3000)),
      ]);
      return true;
    } catch { return false; }
  }

  private async checkRedis(): Promise<boolean> {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
      ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    try { await redis.connect(); await redis.ping(); return true; } catch { return false; } finally { redis.disconnect(); }
  }
}
