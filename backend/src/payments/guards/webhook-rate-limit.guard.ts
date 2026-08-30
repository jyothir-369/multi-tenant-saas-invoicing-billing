import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Simple in-memory rate limiter for webhook endpoints.
 * In production, use Redis-based rate limiting with @nestjs/throttler.
 */
@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  private readonly requestCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly windowMs = 60000; // 1 minute window
  private readonly maxRequests = 100; // max 100 requests per minute

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.getClientIp(request);
    
    // Extract tenant identifier from webhook body or header
    const tenantId = this.extractTenantId(request);
    
    if (!tenantId) {
      // Allow without rate limiting if tenant cannot be determined
      return true;
    }

    const key = `${ip}:${tenantId}`;
    const now = Date.now();
    const record = this.requestCounts.get(key);

    if (!record || now > record.resetTime) {
      this.requestCounts.set(key, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (record.count >= this.maxRequests) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    return true;
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private extractTenantId(request: Request): string | null {
    // Extract tenant ID from Stripe metadata in the webhook body
    const body = request.body;
    if (body?.data?.object?.metadata?.tenantId) {
      return body.data.object.metadata.tenantId;
    }
    
    // Fallback to header-based tenant identification
    const tenantHeader = request.headers['x-tenant-id'];
    if (typeof tenantHeader === 'string') {
      return tenantHeader;
    }

    return null;
  }

  /**
   * Clean up expired entries (call periodically in production)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.requestCounts.entries()) {
      if (now > record.resetTime) {
        this.requestCounts.delete(key);
      }
    }
  }
}
