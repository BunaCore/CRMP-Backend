import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  points: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'custom:rate_limit_options';

export const RateLimit = (opts: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, opts);
