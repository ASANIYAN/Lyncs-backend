import { UrlService } from './url.service';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Controller, Get, Param, Res, Req, HttpStatus } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';

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
