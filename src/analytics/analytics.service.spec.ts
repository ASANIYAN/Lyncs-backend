import type { FastifyRequest } from 'fastify';
import { AnalyticsService } from './analytics.service';
import { RedisService } from '../common/redis/redis.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let redisService: jest.Mocked<
    Pick<RedisService, 'addToStream' | 'getPendingCount' | 'getClient'>
  >;

  beforeEach(() => {
    redisService = {
      addToStream: jest.fn(),
      getPendingCount: jest.fn(),
      getClient: jest.fn(),
    };
    service = new AnalyticsService(redisService as unknown as RedisService);
  });

  it('should enqueue click events into Redis stream', async () => {
    redisService.addToStream.mockResolvedValue('1-0');
    const req = {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120',
        referer: 'https://example.com',
      },
      ip: '203.0.113.1',
    } as unknown as FastifyRequest;

    await service.trackClick('abc123', req);

    expect(redisService.addToStream).toHaveBeenCalledTimes(1);
    expect(redisService.addToStream.mock.calls[0][0]).toBe('clicks:events');
    expect(redisService.addToStream.mock.calls[0][1]).toMatchObject({
      shortCode: 'abc123',
      ipAddress: '203.0.113.1',
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
      referrer: 'https://example.com',
      browser: 'Chrome',
      os: 'macOS',
    });
  });

  it('should return queue health', async () => {
    redisService.getPendingCount.mockResolvedValue(12);
    redisService.getClient.mockReturnValue({
      xlen: jest.fn().mockResolvedValue(50),
    } as any);

    const health = await service.getQueueHealth();

    expect(health).toEqual({
      streamName: 'clicks:events',
      pendingEvents: 12,
      totalLength: 50,
      healthy: true,
    });
  });
});
