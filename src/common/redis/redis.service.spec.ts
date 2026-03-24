import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService Stream Helpers', () => {
  let service: RedisService;
  let client: {
    xadd: jest.Mock;
    xreadgroup: jest.Mock;
    xack: jest.Mock;
    xpending: jest.Mock;
  };

  beforeEach(() => {
    service = new RedisService({} as ConfigService);
    client = {
      xadd: jest.fn(),
      xreadgroup: jest.fn(),
      xack: jest.fn(),
      xpending: jest.fn(),
    };
    (service as any).client = client;
    // readFromStream uses the dedicated blockingClient — wire it to the same mock
    (service as any).blockingClient = client;
  });

  it('should add flattened events to stream', async () => {
    client.xadd.mockResolvedValue('1-0');

    await service.addToStream('clicks:events', {
      shortCode: 'abc123',
      clickedAt: 10,
      nested: { browser: 'Chrome' },
    });

    expect(client.xadd).toHaveBeenCalledTimes(1);
    expect(client.xadd.mock.calls[0][0]).toBe('clicks:events');
  });

  it('should parse xreadgroup response shape', async () => {
    client.xreadgroup.mockResolvedValue([
      [
        'clicks:events',
        [
          [
            '1710000000000-0',
            ['shortCode', 'abc123', 'clickedAt', '123', 'meta', '{"a":1}'],
          ],
        ],
      ],
    ]);

    const results = await service.readFromStream(
      'clicks:events',
      'clicks-workers',
      'worker-1',
    );

    expect(results).toEqual([
      {
        id: '1710000000000-0',
        data: { shortCode: 'abc123', clickedAt: 123, meta: { a: 1 } },
      },
    ]);
  });

  it('should return pending summary count', async () => {
    client.xpending.mockResolvedValue(['7', '0-0', '0-0', []]);
    const count = await service.getPendingCount(
      'clicks:events',
      'clicks-workers',
    );
    expect(count).toBe(7);
  });
});
