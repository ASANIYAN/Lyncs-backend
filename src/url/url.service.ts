import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Url } from './entities/url.entity';
import { Base62Generator } from './utils/base62.generator';
import { User } from '../auth/dto/entities/user.entity';
import { SafetyService } from './safety.service';
import { RedisService } from '../common/redis/redis.service';
import { UrlNormalizerService } from './url-normalizer.service';
import { AnalyticsService } from '../analytics/analytics.service';

// User payload from authenticated request
interface AuthUser {
  id: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class UrlService {
  private readonly logger = new Logger(UrlService.name);
  private readonly MAX_RETRIES = 5;

  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    private readonly generator: Base62Generator,
    private readonly safetyService: SafetyService,
    private readonly redisService: RedisService,
    private readonly urlNormalizer: UrlNormalizerService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async findByCode(short_code: string): Promise<Url | null> {
    return this.findByCodeWithCache(short_code);
  }

  async findByCodeWithCache(shortCode: string): Promise<Url | null> {
    const cacheKey = `url:${shortCode}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Url;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Cache read failed';
      this.logger.warn(`Cache miss fallback for ${shortCode}: ${msg}`);
    }

    try {
      const url = await this.urlRepository.findOne({
        where: { short_code: shortCode, is_active: true },
      });
      if (url) {
        await this.redisService.set(cacheKey, JSON.stringify(url), 86400);
      }
      return url;
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Database lookup failed';
      this.logger.error(`Error finding URL by code: ${msg}`);
      throw new InternalServerErrorException('Error retrieving URL mapping');
    }
  }

  async create(
    originalUrl: string,
    user: AuthUser,
  ): Promise<{ url: Url; isNew: boolean }> {
    const isBlocked = await this.safetyService.isDomainBlocked(originalUrl);
    if (isBlocked) {
      throw new BadRequestException(
        'This domain is blocked for safety reasons',
      );
    }

    const userId = user.id;
    if (!userId) {
      throw new InternalServerErrorException('Invalid user information');
    }

    const { normalized, hash } = this.urlNormalizer.normalizeUrl(originalUrl);

    const existing = await this.urlRepository.findOne({
      where: {
        user: { id: userId },
        url_hash: hash,
        is_active: true,
      },
      relations: ['user'],
    });

    if (existing) {
      return { url: existing, isNew: false };
    }

    let shortCode: string;
    let retries = 0;

    while (retries < this.MAX_RETRIES) {
      shortCode = this.generator.generate();
      const existing = await this.urlRepository.findOne({
        where: { short_code: shortCode },
      });

      if (!existing) {
        const newUrl = this.urlRepository.create({
          original_url: originalUrl,
          short_code: shortCode,
          user: { id: userId } as User, // Create relationship with just the ID
          click_count: 0,
          normalized_url: normalized,
          url_hash: hash,
          safety_status: 'pending',
        });

        try {
          const saved = await this.urlRepository.save(newUrl);
          await this.analyticsService.queueSafetyCheck({
            shortCode: saved.short_code,
            url: saved.original_url,
            queuedAt: Date.now(),
          });
          return { url: saved, isNew: true };
        } catch (error: unknown) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Error saving URL on retry ${retries + 1}: ${errorMsg}`,
          );
          retries++;
          continue;
        }
      }
      retries++;
    }

    this.logger.error(
      `Collision limit reached after ${this.MAX_RETRIES} attempts`,
    );
    throw new InternalServerErrorException(
      'Could not generate a unique short code',
    );
  }

  async findAllByUser(
    user: AuthUser,
    page: number = 1,
    limit: number = 10,
  ): Promise<[Url[], number]> {
    return this.getDashboard(user.id, page, limit).then(result => [
      result.data,
      result.total,
    ]);
  }

  async getDashboard(
    userId: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    sortBy = 'created_at',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{ data: Url[]; total: number; page: number; lastPage: number }> {
    if (!userId) {
      throw new InternalServerErrorException('Invalid user information');
    }

    try {
      const query = this.urlRepository
        .createQueryBuilder('url')
        .innerJoin('url.user', 'user')
        .where('user.id = :userId', { userId });

      this.applyDashboardFilters(query, search, status);

      const validSortColumns = ['created_at', 'click_count', 'original_url'];
      const sortColumn = validSortColumns.includes(sortBy)
        ? sortBy
        : 'created_at';
      query.orderBy(`url.${sortColumn}`, sortOrder);

      const [data, total] = await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        data,
        total,
        page,
        lastPage: Math.ceil(total / limit),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching urls by user: ${errorMsg}`);
      throw new InternalServerErrorException('Failed to fetch dashboard data');
    }
  }

  async deleteUrl(shortCode: string, userId: string): Promise<void> {
    const url = await this.urlRepository.findOne({
      where: { short_code: shortCode },
      relations: ['user'],
    });

    if (!url) {
      throw new NotFoundException('URL not found');
    }

    if (url.user.id !== userId) {
      throw new ForbiddenException('Not authorized to delete this URL');
    }

    url.is_active = false;
    await this.urlRepository.save(url);
    await this.redisService.getClient().del(`url:${shortCode}`);
  }

  private applyDashboardFilters(
    query: SelectQueryBuilder<Url>,
    search?: string,
    status?: string,
  ) {
    if (search) {
      query.andWhere(
        '(url.original_url ILIKE :search OR url.short_code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status === 'active') {
      query.andWhere('url.is_active = true');
    } else if (status === 'inactive') {
      query.andWhere('url.is_active = false');
    } else if (status === 'unsafe') {
      query.andWhere("url.safety_status = 'unsafe'");
    }
  }
}
