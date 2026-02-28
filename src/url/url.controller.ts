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
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';

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
  @ApiResponse({ status: 404, description: 'URL not found or inactive' })
  async redirect(
    @Param('code') code: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const urlEntry = await this.urlService.findByCode(code);

    if (!urlEntry || !urlEntry.is_active) {
      // Direct Fastify response for speed
      return res.status(HttpStatus.NOT_FOUND).send('URL not found or disabled');
    }

    // Fire-and-forget: Track analytics in background
    this.analyticsService.trackClick(code, req).catch((err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Analytics tracking failed for ${code}: ${errorMsg}`);
    });

    // 302 is chosen over 301 to ensure every click passes through
    // the analytics layer for accurate data.
    return res.redirect(urlEntry.original_url, 302);
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
  @ApiResponse({
    status: 201,
    description: 'URL shortened successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing bearer token',
  })
  async create(
    @Body() createUrlDto: CreateUrlDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // req.user is populated by JwtAuthGuard
    return this.urlService.create(createUrlDto.url, req.user);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Get user dashboard with shortened URLs' })
  @ApiResponse({
    status: 200,
    description: 'User URLs retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing bearer token',
  })
  async getUserUrls(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<PaginatedUrlResponseDto> {
    const [urls, total] = await this.urlService.findAllByUser(
      req.user,
      page,
      limit,
    );

    return {
      data: urls.map(url => UrlResponseDto.fromEntity(url)),
      total,
      page,
      last_page: Math.ceil(total / limit),
    };
  }
}
