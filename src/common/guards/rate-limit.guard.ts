import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';
// ConfigService intentionally omitted for simple in-memory guard

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private buckets: Map<string, Bucket> = new Map();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const opts = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // If no metadata provided, allow by default
    if (!opts) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const ip = (req.ip ||
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      'unknown') as string;

    const key = `${req.method}:${req.route?.path || req.url}:${ip}`;
    const now = Date.now();

    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + opts.windowSeconds * 1000,
      });
      return true;
    }

    if (existing.count >= opts.points) {
      this.logger.warn(`Rate limit exceeded for ${key}`);
      return false;
    }

    existing.count += 1;
    this.buckets.set(key, existing);
    return true;
  }
}
