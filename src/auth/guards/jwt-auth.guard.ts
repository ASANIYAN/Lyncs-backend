import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private redisService: RedisService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      console.log('Unauthorized error: Token not exist:', token);
      throw new UnauthorizedException();
    }

    const isBlacklisted = await this.redisService.exists(`bl_${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Session expired or logged out');
    }

    try {
      const payload: {
        sub: string;
        email: string;
        iat: number;
        exp: number;
      } = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });
      // Normalize payload: convert 'sub' to 'id' for consistency with User entity
      (request as Record<string, unknown>).user = {
        id: payload.sub,
        email: payload.email,
        iat: payload.iat,
        exp: payload.exp,
      };
      return true;
    } catch (error) {
      console.log('Unauthorized error: ', error);
      throw new UnauthorizedException();
    }
  }

  private extractTokenFromHeader(request: {
    headers?: {
      authorization?: string;
    };
  }): string | undefined {
    const authHeader = request?.headers?.authorization;

    if (!authHeader) {
      console.log('No authorization header found');
      return undefined;
    }

    const parts = authHeader.split(' ');
    let token: string | undefined;

    // Handle both "Bearer token" and plain "token"
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    } else if (parts.length === 1) {
      // If no "Bearer" prefix, use the whole string as token
      token = parts[0];
    } else {
      console.log(`Invalid authorization header format: ${authHeader}`);
      return undefined;
    }

    if (!token) {
      console.log('Token is empty');
      return undefined;
    }

    console.log('Token extracted successfully');
    return token;
  }
}
