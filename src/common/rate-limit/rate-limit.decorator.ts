import { SetMetadata } from '@nestjs/common';
import { RateLimitPolicy } from './rate-limit.constants';

export const RATE_LIMIT_METADATA_KEY = 'rate_limit:policies';
export const SKIP_RATE_LIMIT_METADATA_KEY = 'rate_limit:skip';

export const RateLimit = (...policies: RateLimitPolicy[]) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, policies);

export const SkipRateLimit = () =>
  SetMetadata(SKIP_RATE_LIMIT_METADATA_KEY, true);
