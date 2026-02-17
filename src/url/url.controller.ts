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
} from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimiterGuard } from '../auth/guards/rate-limiter.guard';
import { CreateUrlDto } from './dto/create-url.dto';

@Controller()
export class RedirectController {
  constructor(
    private readonly urlService: UrlService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get(':code')
  async redirect(
    @Param('code') code: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const urlEntry = await this.urlService.findByCode(code);

    if (!urlEntry || !urlEntry.is_active) {
      return res.status(HttpStatus.NOT_FOUND).send('URL not found or disabled');
    }

    //  Don't 'await' this to ensure the user is redirected immediately
    this.analyticsService.trackClick(code, req).catch(err => {
      // Log error but don't stop the redirect
      console.error('Analytics tracking failed', err);
    });

    // 302 is chosen over 301 to ensure every click passes through
    // the analytics layer for accurate data.
    return res.redirect(urlEntry.original_url, 302);
  }
}

@Controller('urls')
export class UrlController {
  constructor(private readonly urlService: UrlService) {}

  @Post('shorten')
  @UseGuards(JwtAuthGuard, RateLimiterGuard)
  async create(@Body() createUrlDto: CreateUrlDto, @Req() req: any) {
    // req.user is populated by JwtAuthGuard
    return this.urlService.create(createUrlDto.url, req.user);
  }
}
