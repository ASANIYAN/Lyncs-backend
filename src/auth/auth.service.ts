import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../common/redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { Repository } from 'typeorm';
import { RegisterDto } from './dto/register.dto';
import { validateAndSanitizePassword } from './utils/password.validator';
import { User } from './dto/entities/user.entity';
import { RefreshToken } from './dto/entities/refresh-token.entity';
import { Url } from '../url/entities/url.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.saltRounds = Number(this.configService.get('AUTH_SALT_ROUNDS', 12));
  }

  async hashPassword(password: string): Promise<string> {
    if (Buffer.byteLength(password) > 72) {
      throw new BadRequestException('Password exceeds maximum secure length');
    }

    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error: unknown) {
      // Fixed: Proper parentheses instead of backticks
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Hashing failure: ${errorMessage}`);
      throw new InternalServerErrorException('Security service error');
    }
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;

    try {
      return await bcrypt.compare(password, hash);
    } catch (error: unknown) {
      // Fixed: Proper parentheses instead of backticks
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Comparison failure: ${errorMessage}`);
      return false;
    }
  }

  async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: '30m', // Short-lived Access Token
        secret: process.env.JWT_ACCESS_SECRET,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: '7d', // Long-lived Refresh Token
        secret: process.env.JWT_REFRESH_SECRET,
      }),
    ]);

    await this.persistRefreshToken(user, refreshToken);
    return { accessToken, refreshToken };
  }

  async register(registerDto: RegisterDto): Promise<{ message: string }> {
    const { email, password } = registerDto;

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    try {
      // Validate and sanitize password before hashing
      const safePassword = validateAndSanitizePassword(password);
      const saltRounds = this.configService.get<number>('AUTH_SALT_ROUNDS', 12);
      const hashedPassword = await bcrypt.hash(safePassword, saltRounds);

      const user = this.userRepository.create({
        email,
        password: hashedPassword,
      });

      await this.userRepository.save(user);
      return { message: 'User registered successfully' };
    } catch (error) {
      console.log('Error registering:', error);
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password'], // Explicitly select password
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);

    return { accessToken, refreshToken };
  }

  async logout(token: string): Promise<void> {
    try {
      // Decode without verification just to get the 'exp' claim
      const decoded = this.jwtService.decode(token);

      // If decoded is not an object, or doesn't have a numeric exp, return early
      if (!decoded || typeof decoded !== 'object') {
        // If token is malformed, we just return
        return;
      }

      const exp = (decoded as { exp?: number }).exp;
      if (!exp || typeof exp !== 'number') {
        // If there's no expiration timestamp, do nothing
        return;
      }

      // Calculate TTL: expiration timestamp minus current time (in seconds)
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = exp - now;

      if (remainingTime > 0) {
        // Store in Redis with the specific TTL
        await this.redisService.set(`bl_${token}`, 'revoked', remainingTime);
      }
    } catch (error) {
      console.log('error: ', error);
      this.logger.error(`Logout failed for token: ${token}`);
    }
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        refreshToken,
        {
          secret: process.env.JWT_REFRESH_SECRET,
        },
      );

      const tokenHash = this.hashToken(refreshToken);
      const stored = await this.refreshTokenRepository.findOne({
        where: { token_hash: tokenHash, revoked: false },
        relations: ['user'],
      });

      if (!stored || new Date() > stored.expires_at) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (stored.user.id !== payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      stored.revoked = true;
      await this.refreshTokenRepository.save(stored);

      const user = await this.userRepository.findOne({
        where: { id: payload.sub, is_active: true },
      });
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const rotated = await this.generateTokens(user);
      return { ...rotated, expiresIn: 1800 };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const urlCount = await this.urlRepository.count({
      where: { user: { id: userId }, is_active: true },
    });

    const totalClicksRaw = await this.urlRepository
      .createQueryBuilder('url')
      .select('COALESCE(SUM(url.click_count), 0)', 'total')
      .innerJoin('url.user', 'user')
      .where('user.id = :userId', { userId })
      .getRawOne<{ total: string }>();

    const maxRequests = this.configService.get<number>(
      'MAX_URLS_PER_HOUR',
      100,
    );
    const usedRaw =
      (await this.redisService.get(`ratelimit:${userId}:create_url`)) || '0';
    const used = parseInt(usedRaw, 10) || 0;

    return {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      urlCount,
      totalClicks: parseInt(totalClicksRaw?.total || '0', 10),
      rateLimitStatus: {
        action: 'create_url',
        windowSeconds: 3600,
        limit: maxRequests,
        used,
        remaining: Math.max(0, maxRequests - used),
      },
    };
  }

  private async persistRefreshToken(
    user: User,
    refreshToken: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const entity = this.refreshTokenRepository.create({
      user,
      token_hash: tokenHash,
      expires_at: expiresAt,
      revoked: false,
    });
    await this.refreshTokenRepository.save(entity);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
