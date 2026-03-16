import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from './common/dto/error-response.dto';
import { AnalyticsService } from './analytics/analytics.service';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Root - Service status' })
  @ApiResponse({ status: 200, description: 'Service is running' })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: ErrorResponseDto,
  })
  getRoot() {
    const port = process.env.PORT ?? 3000;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'URL-Shortener-API',
      port,
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'System Health Check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async getHealth() {
    const clicksHealth = await this.analyticsService.getQueueHealth();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'URL-Shortener-API',
      streams: {
        clicks: clicksHealth,
      },
    };
  }
}
