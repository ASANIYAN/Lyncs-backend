import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsQueryService } from './analytics-query.service';
import { FastifyRequest } from 'fastify';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RATE_LIMIT_PROFILES } from '../common/rate-limit/rate-limit.constants';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    id: string;
    email: string;
    iat: number;
    exp: number;
  };
};

@ApiTags('analytics')
@Controller('urls/:shortCode/analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('Bearer')
export class AnalyticsController {
  constructor(private readonly analyticsQuery: AnalyticsQueryService) {}

  @Get()
  @RateLimit(RATE_LIMIT_PROFILES.URL_ANALYTICS_READ)
  @ApiOperation({ summary: 'Get analytics for a short URL' })
  @ApiQuery({
    name: 'timeRange',
    required: false,
    enum: ['24h', '7d', '30d', '90d'],
    description: 'Analytics window (default: 7d)',
  })
  async getAnalytics(
    @Param('shortCode') shortCode: string,
    @Query('timeRange') timeRange = '7d',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.analyticsQuery.getAnalytics(shortCode, req.user.id, timeRange);
  }
}
