import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
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
import { EmailService } from '../common/mailer/mailer.service';
import { LoginDto } from './dto/login.dto';
import { IsNull, Repository } from 'typeorm';
import { RegisterDto } from './dto/register.dto';
import { validateAndSanitizePassword } from './utils/password.validator';
import { User } from './dto/entities/user.entity';
import { RefreshToken } from './dto/entities/refresh-token.entity';
import { EmailOtp, OtpPurpose } from './dto/entities/email-otp.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(EmailOtp)
    private readonly emailOtpRepository: Repository<EmailOtp>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
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

    const t0 = performance.now();
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
    this.logger.debug(
      `[generateTokens] jwt_sign: ${parseFloat((performance.now() - t0).toFixed(2))}ms`,
    );

    const t1 = performance.now();
    this.persistRefreshToken(user, refreshToken).catch(err =>
      this.logger.error(
        `Failed to persist refresh token: ${err instanceof Error ? err.message : err}`,
      ),
    );
    this.logger.debug(
      `[generateTokens] persistRefreshToken: ${parseFloat((performance.now() - t1).toFixed(2))}ms`,
    );

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
        email_verified_at: new Date(),
      });

      await this.userRepository.save(user);
      return { message: 'User registered successfully' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Registration failed: ${msg}`);
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async login(
    loginDto: LoginDto,
    device: { ip: string | null; userAgent: string | null },
  ): Promise<
    | { accessToken: string; refreshToken: string; expiresIn: number }
    | { otpRequired: true; message: string }
  > {
    const { email, password } = loginDto;
    const timings: Record<string, number> = {};

    const t0 = performance.now();
    const user = await this.userRepository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'password',
        'last_login_device_hash',
        'email_verified_at',
      ], // Explicitly select password
    });
    timings['db_findUser'] = parseFloat((performance.now() - t0).toFixed(2));

    if (!user) {
      this.logger.debug('[login] timings ms:', timings);
      throw new UnauthorizedException('Invalid credentials');
    }

    const t1 = performance.now();
    const isPasswordValid = await bcrypt.compare(password, user.password);
    timings['bcrypt_compare'] = parseFloat((performance.now() - t1).toFixed(2));

    if (!isPasswordValid) {
      this.logger.debug('[login] timings ms:', timings);
      throw new UnauthorizedException('Invalid credentials');
    }

    const deviceHash = this.computeDeviceHash(device.ip, device.userAgent);
    const requiresOtp =
      !!deviceHash && user.last_login_device_hash !== deviceHash;

    if (requiresOtp) {
      await this.requestOtp({
        email: user.email,
        purpose: 'login',
        userId: user.id,
        deviceHash,
        ip: device.ip,
        userAgent: device.userAgent,
      });
      this.logger.debug('[login] timings ms:', timings);
      return {
        otpRequired: true,
        message: 'OTP sent to email. Verify to complete login.',
      };
    }

    const t2 = performance.now();
    const { accessToken, refreshToken } = await this.generateTokens(user);
    timings['generateTokens'] = parseFloat((performance.now() - t2).toFixed(2));

    await this.updateLoginSignals(
      user,
      device.ip,
      device.userAgent,
      deviceHash,
    );

    this.logger.debug('[login] timings ms:', timings);
    return { accessToken, refreshToken, expiresIn: 1800 };
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

      // Bust the profile cache so the next GET /auth/profile re-fetches from DB
      const decoded2 = this.jwtService.decode(token);
      const sub =
        decoded2 && typeof decoded2 === 'object' && 'sub' in decoded2
          ? (decoded2 as { sub: string }).sub
          : null;
      if (sub) {
        await this.redisService.getClient().del(`profile:${sub}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Logout failed: ${msg}`);
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
    const cacheKey = `profile:${userId}`;
    const PROFILE_TTL = 30;
    const timings: Record<string, number> = {};
    const t = (label: string, since: number) => {
      timings[label] = parseFloat((performance.now() - since).toFixed(2));
    };

    let s = performance.now();
    try {
      const cached = await this.redisService.get(cacheKey);
      t('redis_read', s);

      if (cached) {
        timings['cache_hit'] = 1;
        this.logger.debug(
          `[getProfile] timings ms: ${JSON.stringify(timings)}`,
        );
        return JSON.parse(cached) as Record<string, unknown>;
      }
    } catch {
      t('redis_read', s);
      timings['cache_hit'] = 0;
      // cache miss — fall through
    }

    s = performance.now();
    const row = await this.userRepository
      .createQueryBuilder('user')
      .select('user.id', 'id')
      .addSelect('user.email', 'email')
      .addSelect('user.created_at', 'createdAt')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN u.is_active = true THEN u.id END)',
        'urlCount',
      )
      .addSelect('COALESCE(SUM(u.click_count), 0)', 'totalClicks')
      .leftJoin('urls', 'u', 'u.user_id = user.id')
      .where('user.id = :userId', { userId })
      .groupBy('user.id')
      .addGroupBy('user.email')
      .addGroupBy('user.created_at')
      .getRawOne<{
        id: string;
        email: string;
        createdAt: Date;
        urlCount: string;
        totalClicks: string;
      }>();
    t('db_aggregation', s);

    if (!row) {
      this.logger.debug(`[getProfile] timings ms: ${JSON.stringify(timings)}`);
      throw new UnauthorizedException('User not found');
    }

    const profile = {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt,
      urlCount: parseInt(row.urlCount, 10),
      totalClicks: parseInt(row.totalClicks, 10),
    };

    s = performance.now();
    this.redisService
      .set(cacheKey, JSON.stringify(profile), PROFILE_TTL)
      .then(() => {
        this.logger.debug(
          `[getProfile] redis_write: ${(performance.now() - s).toFixed(2)}ms`,
        );
      })
      .catch(() => {});

    this.logger.debug(`[getProfile] timings ms: ${JSON.stringify(timings)}`);
    return profile;
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

  private hashOtp(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateOtpCode(): string {
    const n = randomInt(0, 1_000_000);
    return n.toString().padStart(6, '0');
  }

  private hashUserAgent(userAgent: string | null): string | null {
    if (!userAgent) return null;
    return createHash('sha256').update(userAgent).digest('hex');
  }

  private computeDeviceHash(
    ip: string | null,
    userAgent: string | null,
  ): string | null {
    if (!ip || !userAgent) return null;
    return createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
  }

  private async requestOtp(params: {
    email: string;
    purpose: OtpPurpose;
    userId?: string;
    deviceHash?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const otpTtl = this.configService.get<number>('OTP_TTL_SECONDS', 600);
    const code = this.generateOtpCode();
    const codeHash = this.hashOtp(code);
    const expiresAt = new Date(Date.now() + otpTtl * 1000);

    await this.emailOtpRepository.delete({
      email: params.email,
      purpose: params.purpose,
      consumed_at: IsNull(),
    });

    const entity = this.emailOtpRepository.create({
      email: params.email,
      user_id: params.userId ?? null,
      purpose: params.purpose,
      code_hash: codeHash,
      expires_at: expiresAt,
      consumed_at: null,
      attempts: 0,
      device_hash: params.deviceHash ?? null,
      ip_address: params.ip ?? null,
      user_agent_hash: this.hashUserAgent(params.userAgent ?? null),
    });
    await this.emailOtpRepository.save(entity);

    await this.emailService.sendOtpEmail(params.email, code, params.purpose);
  }

  private async verifyOtp(params: {
    email: string;
    purpose: OtpPurpose;
    code: string;
    deviceHash?: string | null;
  }): Promise<void> {
    const maxAttempts = this.configService.get<number>('OTP_MAX_ATTEMPTS', 5);
    const codeHash = this.hashOtp(params.code);
    const now = new Date();

    const otp = await this.emailOtpRepository.findOne({
      where: {
        email: params.email,
        purpose: params.purpose,
        consumed_at: IsNull(),
      },
      order: { created_at: 'DESC' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (otp.expires_at <= now) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (otp.device_hash && params.deviceHash !== otp.device_hash) {
      throw new BadRequestException('OTP does not match this device');
    }

    if (otp.attempts >= maxAttempts) {
      throw new BadRequestException('OTP attempts exceeded');
    }

    if (otp.code_hash !== codeHash) {
      otp.attempts += 1;
      await this.emailOtpRepository.save(otp);
      throw new BadRequestException('Invalid or expired OTP');
    }

    otp.consumed_at = new Date();
    await this.emailOtpRepository.save(otp);
  }

  private async updateLoginSignals(
    user: User,
    ip: string | null,
    userAgent: string | null,
    deviceHash: string | null,
  ) {
    user.last_login_at = new Date();
    user.last_login_ip = ip ?? null;
    user.last_login_user_agent_hash = this.hashUserAgent(userAgent);
    user.last_login_device_hash = deviceHash ?? null;
    if (!user.email_verified_at) {
      user.email_verified_at = new Date();
    }
    await this.userRepository.save(user);
  }

  async requestRegisterOtp(email: string): Promise<{ message: string }> {
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    await this.requestOtp({ email, purpose: 'register' });
    return { message: 'OTP sent to email' };
  }

  async verifyRegisterOtp(
    dto: RegisterDto & { otp: string },
  ): Promise<{ message: string }> {
    await this.verifyOtp({
      email: dto.email,
      purpose: 'register',
      code: dto.otp,
    });

    return this.register(dto);
  }

  async requestForgotPasswordOtp(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (user) {
      await this.requestOtp({
        email,
        purpose: 'forgot_password',
        userId: user.id,
      });
    }
    return { message: 'If the email exists, an OTP has been sent' };
  }

  async resetPasswordWithOtp(params: {
    email: string;
    otp: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    await this.verifyOtp({
      email: params.email,
      purpose: 'forgot_password',
      code: params.otp,
    });

    const user = await this.userRepository.findOne({
      where: { email: params.email },
      select: ['id', 'email', 'password', 'email_verified_at'],
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const safePassword = validateAndSanitizePassword(params.newPassword);
    user.password = await bcrypt.hash(safePassword, this.saltRounds);
    if (!user.email_verified_at) {
      user.email_verified_at = new Date();
    }
    await this.userRepository.save(user);
    return { message: 'Password reset successfully' };
  }

  async verifyLoginOtp(
    params: { email: string; otp: string },
    device: { ip: string | null; userAgent: string | null },
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const user = await this.userRepository.findOne({
      where: { email: params.email },
      select: ['id', 'email', 'password'],
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const deviceHash = this.computeDeviceHash(device.ip, device.userAgent);
    await this.verifyOtp({
      email: params.email,
      purpose: 'login',
      code: params.otp,
      deviceHash,
    });

    const { accessToken, refreshToken } = await this.generateTokens(user);
    await this.updateLoginSignals(
      user,
      device.ip,
      device.userAgent,
      deviceHash,
    );
    return { accessToken, refreshToken, expiresIn: 1800 };
  }
}
