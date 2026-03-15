import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

type AuthenticatedRequest = {
  user?: {
    id: string;
    email: string;
    iat: number;
    exp: number;
  };
};

/**
 * Atomic rate-limit Lua script.
 * Increments the counter and sets TTL in a single round-trip.
 * Eliminates the race condition where the key could live forever if the
 * process crashed between INCR and EXPIRE.
 *
 * Returns the current count after increment.
 */
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly windowSeconds = 3600;
  private readonly maxRequests: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.maxRequests = configService.get<number>('MAX_URLS_PER_HOUR', 100);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) return true;

    const key = `ratelimit:${userId}:create_url`;

    // Single atomic round-trip: INCR + conditional EXPIRE via Lua
    const count = (await this.redisService
      .getClient()
      .eval(RATE_LIMIT_SCRIPT, 1, key, String(this.windowSeconds))) as number;

    if (count > this.maxRequests) {
      throw new HttpException(
        'Rate limit exceeded. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
