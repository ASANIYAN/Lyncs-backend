import { UrlService } from './url.service';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  Controller,
  Get,
  Param,
  Res,
  Req,
  HttpStatus,
  Post,
  UseGuards,
  Body,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Logger,
  Delete,
} from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimiterGuard } from '../auth/guards/rate-limiter.guard';
import { CreateUrlDto } from './dto/create-url.dto';
import {
  PaginatedUrlResponseDto,
  UrlResponseDto,
} from './dto/url-list-response.dto';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    id: string;
    email: string;
    iat: number;
    exp: number;
  };
};

@ApiTags('redirection')
@Controller()
export class RedirectController {
  private readonly logger = new Logger(RedirectController.name);

  constructor(
    private readonly urlService: UrlService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get(':code')
  @ApiOperation({ summary: 'Redirect to original URL' })
  @ApiParam({ name: 'code', description: 'The 6-character short code' })
  @ApiResponse({
    status: 302,
    description: 'Found - Redirecting to destination',
  })
  @ApiResponse({
    status: 404,
    description: 'URL not found or inactive',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    type: ErrorResponseDto,
  })
  async redirect(
    @Param('code') code: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    try {
      if (!/^[a-zA-Z0-9]{6,10}$/.test(code)) {
        return res.status(HttpStatus.NOT_FOUND).send({
          statusCode: 404,
          message: 'Invalid short code format',
        });
      }

      const urlEntry = await this.urlService.findByCodeWithCache(code);
      if (!urlEntry || !urlEntry.is_active) {
        return res.status(HttpStatus.NOT_FOUND).send({
          statusCode: 404,
          message: 'URL not found or has been deleted',
        });
      }

      if (urlEntry.expires_at && new Date(urlEntry.expires_at) < new Date()) {
        return res.status(HttpStatus.GONE).send({
          statusCode: 410,
          message: 'This short URL has expired',
        });
      }

      if (urlEntry.safety_status === 'unsafe') {
        return res.status(HttpStatus.OK).type('text/html').send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Security Warning</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 100px auto; text-align: center; }
                h1 { color: #d32f2f; }
                .warning { background: #fff3cd; padding: 20px; border-radius: 8px; }
              </style>
            </head>
            <body>
              <div class="warning">
                <h1>Security Warning</h1>
                <p>This link has been flagged as potentially unsafe.</p>
                <p><strong>Destination:</strong> ${urlEntry.original_url}</p>
                <a href="${urlEntry.original_url}" style="color: red;">Proceed Anyway</a>
              </div>
            </body>
          </html>
        `);
      }

      this.analyticsService.trackClick(code, req).catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Analytics tracking failed for ${code}: ${errorMsg}`);
      });

      return res.redirect(urlEntry.original_url, 302);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redirect error for ${code}: ${errorMsg}`);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
  }
}

@ApiTags('urls')
@Controller('urls')
export class UrlController {
  constructor(private readonly urlService: UrlService) {}

  @Post('shorten')
  @UseGuards(JwtAuthGuard, RateLimiterGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Create a shortened URL' })
  @ApiResponse({ status: 201, description: 'URL shortened successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid URL or blocked domain',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing bearer token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Could not generate short code',
    type: ErrorResponseDto,
  })
  async create(
    @Body() createUrlDto: CreateUrlDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.urlService.create(createUrlDto.url, req.user);
    return {
      ...result.url,
      isNew: result.isNew,
      message: result.isNew
        ? 'Short URL created successfully'
        : 'URL already shortened. Returning existing link.',
    };
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Get user dashboard with shortened URLs' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for URL or short code',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive'],
    example: 'active',
    description: 'Filter by URL status (default: active)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    example: 'created_at',
    description: 'Sort field (default: created_at)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    example: 'ASC',
    description: 'Sort order (default: ASC)',
  })
  @ApiResponse({ status: 200, description: 'User URLs retrieved successfully' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing bearer token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to fetch dashboard data',
    type: ErrorResponseDto,
  })
  async getUserUrls(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status: string = 'active',
    @Query('sortBy') sortBy = 'created_at',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'ASC',
    @Query('search') search?: string,
  ): Promise<PaginatedUrlResponseDto> {
    const dashboard = await this.urlService.getDashboard(
      req.user.id,
      page,
      limit,
      search,
      status,
      sortBy,
      sortOrder,
    );

    return {
      data: dashboard.data.map(url => UrlResponseDto.fromEntity(url)),
      total: dashboard.total,
      page,
      last_page: dashboard.lastPage,
    };
  }

  @Delete(':shortCode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  async deleteUrl(
    @Param('shortCode') shortCode: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.urlService.deleteUrl(shortCode, req.user.id);
    return { success: true, message: 'URL deleted successfully' };
  }
}
