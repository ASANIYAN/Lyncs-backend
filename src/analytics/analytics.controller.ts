import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsQueryService } from './analytics-query.service';
import { FastifyRequest } from 'fastify';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    id: string;
    email: string;
    iat: number;
    exp: number;
  };
};

@Controller('urls/:shortCode/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsQuery: AnalyticsQueryService) {}

  @Get()
  async getAnalytics(
    @Param('shortCode') shortCode: string,
    @Query('timeRange') timeRange = '7d',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.analyticsQuery.getAnalytics(shortCode, req.user.id, timeRange);
  }
}
