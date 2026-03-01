import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

@Injectable()
export class UrlNormalizerService {
  normalizeUrl(originalUrl: string): { normalized: string; hash: string } {
    try {
      const parsed = new URL(originalUrl);
      parsed.hostname = parsed.hostname.toLowerCase();

      if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      parsed.hash = '';

      const params = new URLSearchParams(parsed.search);
      const sorted = new URLSearchParams();
      Array.from(params.keys())
        .sort()
        .forEach(key => {
          params.getAll(key).forEach(value => sorted.append(key, value));
        });
      parsed.search = sorted.toString();

      if (parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
      }

      const normalized = parsed.toString();
      const hash = createHash('sha256').update(normalized).digest('hex');
      return { normalized, hash };
    } catch {
      const hash = createHash('sha256').update(originalUrl).digest('hex');
      return { normalized: originalUrl, hash };
    }
  }
}
