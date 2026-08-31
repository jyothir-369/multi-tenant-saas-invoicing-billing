import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_TYPE_KEY = 'rateLimitType';
export const RateLimit = (type: string) =>
  SetMetadata(RATE_LIMIT_TYPE_KEY, type);
