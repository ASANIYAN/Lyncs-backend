import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class RateLimiterGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;

    if (!userId) return true;

    const windowSizeInSeconds = 3600; // 1 hour
    const maxRequests = this.configService.get<number>(
      'MAX_URLS_PER_HOUR',
      100,
    );

    const key = `ratelimit:${userId}:create_url`;

    const currentUsage = await this.redisService.incr(key);

    if (currentUsage === 1) {
      await this.redisService.expire(key, windowSizeInSeconds);
    }

    if (currentUsage > maxRequests) {
      throw new HttpException(
        'Rate limit exceeded. Try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
