import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Click } from './entities/click.entity';
import { Url } from '../url/entities/url.entity';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class AnalyticsQueryService {
  private readonly ANALYTICS_TTL = 60; // seconds

  constructor(
    @InjectRepository(Click)
    private readonly clickRepo: Repository<Click>,
    @InjectRepository(Url)
    private readonly urlRepo: Repository<Url>,
    private readonly redisService: RedisService,
  ) {}

  async getAnalytics(shortCode: string, userId: string, timeRange = '7d') {
    const cacheKey = `analytics:${shortCode}:${timeRange}`;

    // Serve from cache when available
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Record<string, unknown>;
      }
    } catch {
      // cache miss — fall through
    }

    const url = await this.urlRepo.findOne({
      where: { short_code: shortCode },
      relations: ['user'],
    });

    if (!url) {
      throw new NotFoundException('URL not found');
    }

    if (url.user.public_id !== userId) {
      throw new ForbiddenException(
        'Not authorized to view analytics for this URL',
      );
    }

    const startDate = this.calculateStartDate(timeRange);
    const [
      totalClicks,
      uniqueVisitors,
      clicksByDay,
      topReferrers,
      topCountries,
      deviceTypes,
      browsers,
      operatingSystems,
      recentClicks,
    ] = await Promise.all([
      this.getTotalClicks(shortCode, startDate),
      this.getUniqueVisitors(shortCode, startDate),
      this.getClicksByDay(shortCode, startDate),
      this.getTopReferrers(shortCode, startDate),
      this.getTopCountries(shortCode, startDate),
      this.getDeviceTypes(shortCode, startDate),
      this.getBrowsers(shortCode, startDate),
      this.getOperatingSystems(shortCode, startDate),
      this.getRecentClicks(shortCode, 20),
    ]);

    const result = {
      shortCode,
      totalClicks,
      uniqueVisitors,
      createdAt: url.created_at,
      clicksByDay,
      topReferrers,
      topCountries,
      deviceTypes,
      browsers,
      operatingSystems,
      recentClicks,
    };

    // Cache result — fire-and-forget, never block the response
    this.redisService
      .set(cacheKey, JSON.stringify(result), this.ANALYTICS_TTL)
      .catch(() => {});

    return result;
  }

  private calculateStartDate(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'all':
        return new Date(0);
      case '7d':
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  private async getTotalClicks(shortCode: string, startDate: Date) {
    return this.clickRepo
      .createQueryBuilder('click')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .getCount();
  }

  private async getUniqueVisitors(shortCode: string, startDate: Date) {
    const raw = await this.clickRepo
      .createQueryBuilder('click')
      .select('COUNT(DISTINCT click.ip_address)', 'count')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .getRawOne<{ count: string }>();
    return parseInt(raw?.count || '0', 10);
  }

  private async getClicksByDay(shortCode: string, startDate: Date) {
    const rows = await this.clickRepo
      .createQueryBuilder('click')
      .select('DATE(click.clicked_at)', 'date')
      .addSelect('COUNT(*)', 'clicks')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .groupBy('DATE(click.clicked_at)')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; clicks: string }>();

    return rows.map(row => ({
      date: row.date,
      clicks: parseInt(row.clicks, 10),
    }));
  }

  private async getTopReferrers(shortCode: string, startDate: Date) {
    const rows = await this.clickRepo
      .createQueryBuilder('click')
      .select("COALESCE(click.referrer, 'direct')", 'referrer')
      .addSelect('COUNT(*)', 'clicks')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .groupBy('referrer')
      .orderBy('clicks', 'DESC')
      .limit(10)
      .getRawMany<{ referrer: string; clicks: string }>();

    const total = rows.reduce((sum, row) => sum + parseInt(row.clicks, 10), 0);
    return rows.map(row => {
      const clicks = parseInt(row.clicks, 10);
      return {
        referrer: row.referrer,
        clicks,
        percentage: total > 0 ? Number(((clicks / total) * 100).toFixed(1)) : 0,
      };
    });
  }

  private async getTopCountries(shortCode: string, startDate: Date) {
    const rows = await this.clickRepo
      .createQueryBuilder('click')
      .select("COALESCE(click.country, 'XX')", 'country')
      .addSelect('COUNT(*)', 'clicks')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .groupBy('country')
      .orderBy('clicks', 'DESC')
      .limit(10)
      .getRawMany<{ country: string; clicks: string }>();

    return rows.map(row => ({
      country: row.country,
      clicks: parseInt(row.clicks, 10),
    }));
  }

  private async getDeviceTypes(shortCode: string, startDate: Date) {
    const rows = await this.clickRepo
      .createQueryBuilder('click')
      .select("COALESCE(click.device_type, 'unknown')", 'type')
      .addSelect('COUNT(*)', 'clicks')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .groupBy('type')
      .getRawMany<{ type: string; clicks: string }>();

    const total = rows.reduce((sum, row) => sum + parseInt(row.clicks, 10), 0);
    return rows.map(row => {
      const clicks = parseInt(row.clicks, 10);
      return {
        type: row.type,
        clicks,
        percentage: total > 0 ? Number(((clicks / total) * 100).toFixed(1)) : 0,
      };
    });
  }

  private async getBrowsers(shortCode: string, startDate: Date) {
    const rows = await this.clickRepo
      .createQueryBuilder('click')
      .select("COALESCE(click.browser, 'unknown')", 'browser')
      .addSelect('COUNT(*)', 'clicks')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .groupBy('browser')
      .orderBy('clicks', 'DESC')
      .limit(10)
      .getRawMany<{ browser: string; clicks: string }>();

    return rows.map(row => ({
      browser: row.browser,
      clicks: parseInt(row.clicks, 10),
    }));
  }

  private async getOperatingSystems(shortCode: string, startDate: Date) {
    const rows = await this.clickRepo
      .createQueryBuilder('click')
      .select("COALESCE(click.os, 'unknown')", 'os')
      .addSelect('COUNT(*)', 'clicks')
      .where('click.short_code = :shortCode', { shortCode })
      .andWhere('click.clicked_at >= :startDate', { startDate })
      .groupBy('os')
      .orderBy('clicks', 'DESC')
      .limit(10)
      .getRawMany<{ os: string; clicks: string }>();

    return rows.map(row => ({
      os: row.os,
      clicks: parseInt(row.clicks, 10),
    }));
  }

  private async getRecentClicks(shortCode: string, limit: number) {
    const rows = await this.clickRepo.find({
      where: { short_code: shortCode },
      order: { clicked_at: 'DESC' },
      take: limit,
      select: ['clicked_at', 'country', 'referrer', 'device_type'],
    });

    return rows.map(row => ({
      clickedAt: row.clicked_at,
      country: row.country,
      referrer: row.referrer,
      deviceType: row.device_type,
    }));
  }
}
