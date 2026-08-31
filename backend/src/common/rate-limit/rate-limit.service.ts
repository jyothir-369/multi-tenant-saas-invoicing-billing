import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private redis: Redis | null = null;
  private readonly configs: Record<string, RateLimitConfig> = {
    payments: { windowMs: 60000, maxRequests: 10 }, // 10 requests per minute
    auth: { windowMs: 900000, maxRequests: 5 }, // 5 attempts per 15 minutes
    default: { windowMs: 60000, maxRequests: 100 }, // 100 requests per minute
  };

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl);
        this.logger.log('Redis connected for rate limiting');
      } catch (error) {
        this.logger.warn('Failed to connect to Redis, rate limiting will be in-memory');
        this.redis = null;
      }
    } else {
      this.logger.warn('REDIS_URL not configured, using in-memory rate limiting');
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async checkRateLimit(
    key: string,
    limitType: keyof typeof this.configs = 'default',
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const config = this.configs[limitType] || this.configs.default;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    if (this.redis) {
      return this.checkRedisRateLimit(key, config, now, windowStart);
    }

    return this.checkInMemoryRateLimit(key, config, now, windowStart);
  }

  private async checkRedisRateLimit(
    key: string,
    config: RateLimitConfig,
    now: number,
    windowStart: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const redisKey = `ratelimit:${key}`;
    const resetAt = now + config.windowMs;

    try {
      const pipeline = this.redis!.pipeline();
      pipeline.zremrangebyscore(redisKey, 0, windowStart);
      pipeline.zcard(redisKey);
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
      pipeline.expire(redisKey, Math.ceil(config.windowMs / 1000));
      const results = await pipeline.exec();

      const count = (results?.[1]?.[1] as number) || 0;
      const allowed = count < config.maxRequests;
      const remaining = Math.max(0, config.maxRequests - count - 1);

      return { allowed, remaining, resetAt };
    } catch (error) {
      this.logger.error('Redis rate limit check failed', error);
      return { allowed: true, remaining: config.maxRequests, resetAt };
    }
  }

  private inMemoryStore = new Map<string, { count: number; resetAt: number }>();

  private checkInMemoryRateLimit(
    key: string,
    config: RateLimitConfig,
    now: number,
    windowStart: number,
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const entry = this.inMemoryStore.get(key);
    const resetAt = (entry?.resetAt || now) + config.windowMs;

    if (!entry || entry.resetAt <= now) {
      this.inMemoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt: now + config.windowMs,
      };
    }

    const allowed = entry.count < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - entry.count - 1);

    if (allowed) {
      entry.count++;
    }

    return { allowed, remaining, resetAt };
  }
}
