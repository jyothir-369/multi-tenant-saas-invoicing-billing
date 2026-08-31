import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_TYPE_KEY } from './rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private rateLimitService: RateLimitService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitType = this.reflector.get<string>(
      RATE_LIMIT_TYPE_KEY,
      context.getHandler(),
    );

    if (!rateLimitType) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Create a rate limit key based on tenant or IP
    let key: string;
    if (request.user?.tenantId) {
      key = `${rateLimitType}:${request.user.tenantId}`;
    } else {
      key = `${rateLimitType}:${request.ip || 'unknown'}`;
    }

    const result = await this.rateLimitService.checkRateLimit(
      key,
      rateLimitType as any,
    );

    // Set rate limit headers
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later',
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
