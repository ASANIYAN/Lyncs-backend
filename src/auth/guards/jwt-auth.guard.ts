import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

type AuthenticatedRequest = FastifyRequest & {
  user?: {
    id: string;
    email: string;
    iat: number;
    exp: number;
  };
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  /** Cached at construction time — avoids ConfigService lookup on every request */
  private readonly jwtSecret: string;

  constructor(
    private redisService: RedisService,
    private jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtSecret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    // Redis blacklist check (fast path — usually false)
    const isBlacklisted = await this.redisService.exists(`bl_${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Session expired or logged out');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        iat: number;
        exp: number;
      }>(token, { secret: this.jwtSecret });

      request.user = {
        id: payload.sub,
        email: payload.email,
        iat: payload.iat,
        exp: payload.exp,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const authHeader = request.headers?.authorization;
    if (!authHeader) return undefined;

    const spaceIdx = authHeader.indexOf(' ');
    if (spaceIdx === -1) return authHeader; // plain token, no prefix

    const scheme = authHeader.slice(0, spaceIdx).toLowerCase();
    if (scheme !== 'bearer') {
      this.logger.warn(`Unsupported auth scheme: ${scheme}`);
      return undefined;
    }

    const token = authHeader.slice(spaceIdx + 1).trim();
    return token.length > 0 ? token : undefined;
  }
}
