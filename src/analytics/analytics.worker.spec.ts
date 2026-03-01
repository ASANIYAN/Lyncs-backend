import { AnalyticsWorker } from './analytics.worker';
import { RedisService } from '../common/redis/redis.service';
import { Repository } from 'typeorm';
import { Click } from './entities/click.entity';
import { Url } from '../url/entities/url.entity';

describe('AnalyticsWorker', () => {
  let worker: AnalyticsWorker;
  let redisService: jest.Mocked<Pick<RedisService, 'ackMessage'>>;
  let clickRepo: jest.Mocked<Pick<Repository<Click>, 'insert'>>;
  let execute: jest.Mock;

  beforeEach(() => {
    redisService = {
      ackMessage: jest.fn(),
    };

    clickRepo = {
      insert: jest.fn(),
    };

    execute = jest.fn().mockResolvedValue(undefined);
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute,
    };

    const urlRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    worker = new AnalyticsWorker(
      redisService as unknown as RedisService,
      clickRepo as unknown as Repository<Click>,
      urlRepo as unknown as Repository<Url>,
    );
  });

  it('should process batch, insert clicks and ack messages', async () => {
    await (worker as any).processBatch([
      {
        id: '1-0',
        data: {
          shortCode: 'abc123',
          clickedAt: Date.now(),
          ipAddress: '203.0.113.5',
          userAgent: 'Mozilla/5.0',
          referrer: 'direct',
          country: 'US',
          deviceType: 'desktop',
          browser: 'Chrome',
          os: 'Windows',
        },
      },
      {
        id: '2-0',
        data: {},
      },
    ]);

    expect(clickRepo.insert).toHaveBeenCalledTimes(1);
    expect(clickRepo.insert.mock.calls[0][0]).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(redisService.ackMessage).toHaveBeenCalledTimes(2);
  });
});
