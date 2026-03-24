import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SafetyWorker } from './safety.worker';
import { SafetyService, SafetyCheckResult } from './safety.service';
import { RedisService } from '../common/redis/redis.service';
import { Url } from './entities/url.entity';

type MockSafetyService = {
  checkUrl: jest.Mock<Promise<SafetyCheckResult>, [string]>;
};

type MockRedisService = {
  readFromStream: jest.Mock<
    Promise<Array<{ id: string; data: Record<string, string> }>>,
    [string, string, string, number, number]
  >;
  ackMessage: jest.Mock<Promise<void>, [string, string, string]>;
  getClient: jest.Mock<{ del: jest.Mock }, []>;
};

type MockUrlRepository = Pick<Repository<Url>, 'update'> & {
  update: jest.Mock;
};

const STREAM_NAME = 'safety:checks';
const GROUP_NAME = 'safety-workers';

function makeMessage(
  id: string,
  shortCode: string,
  url: string,
): { id: string; data: Record<string, string> } {
  return { id, data: { shortCode, url } };
}

describe('SafetyWorker', () => {
  let worker: SafetyWorker;
  let safetyService: MockSafetyService;
  let redisService: MockRedisService;
  let urlRepository: MockUrlRepository;
  let loggerErrorSpy: jest.SpyInstance;

  async function processOneMessage(message: {
    id: string;
    data: Record<string, string>;
  }): Promise<void> {
    let callCount = 0;
    redisService.readFromStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([message]);
      worker.onModuleDestroy();
      return Promise.resolve([]);
    });

    await worker['startConsuming']();
  }

  beforeEach(async () => {
    const mockDelFn = jest.fn<Promise<number>, [string]>().mockResolvedValue(1);

    safetyService = {
      checkUrl: jest.fn<Promise<SafetyCheckResult>, [string]>(),
    };

    redisService = {
      readFromStream: jest
        .fn<
          Promise<Array<{ id: string; data: Record<string, string> }>>,
          [string, string, string, number, number]
        >()
        .mockResolvedValue([]),
      ackMessage: jest
        .fn<Promise<void>, [string, string, string]>()
        .mockResolvedValue(undefined),
      getClient: jest
        .fn<{ del: jest.Mock }, []>()
        .mockReturnValue({ del: mockDelFn }),
    };

    urlRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyWorker,
        { provide: SafetyService, useValue: safetyService },
        { provide: RedisService, useValue: redisService },
        { provide: getRepositoryToken(Url), useValue: urlRepository },
      ],
    }).compile();

    worker = module.get<SafetyWorker>(SafetyWorker);

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    jest.clearAllMocks();

    redisService.ackMessage.mockResolvedValue(undefined);
    redisService.readFromStream.mockResolvedValue([]);
    redisService.getClient.mockReturnValue({ del: mockDelFn });
    urlRepository.update.mockResolvedValue({ affected: 1 });
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('message processing', () => {
    const testMessage = makeMessage(
      'msg-001',
      'abc123',
      'https://some-url.com',
    );

    it('should mark URL as unchecked when result is skipped due to trusted_domain', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: true,
        reason: 'trusted_domain',
      });

      await processOneMessage(testMessage);

      expect(urlRepository.update).toHaveBeenCalledWith(
        { short_code: 'abc123' },
        { safety_checked: false, safety_checked_at: undefined },
      );
    });

    it('should NOT include is_active in the update when the result is skipped', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: true,
        reason: 'trusted_domain',
      });

      await processOneMessage(testMessage);

      const updateCalls = urlRepository.update.mock.calls as [
        Record<string, unknown>,
        Record<string, unknown>,
      ][];
      const updatePayload = updateCalls[0][1];
      expect(updatePayload).not.toHaveProperty('is_active');
    });

    it('should mark URL as unchecked when result is skipped due to quota_exhausted', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: true,
        reason: 'quota_exhausted',
      });

      await processOneMessage(testMessage);

      expect(urlRepository.update).toHaveBeenCalledWith(
        { short_code: 'abc123' },
        { safety_checked: false, safety_checked_at: undefined },
      );
    });

    it('should mark URL as checked and active when the API confirms safe', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: false,
        reason: 'api_checked',
      });

      await processOneMessage(testMessage);

      expect(urlRepository.update).toHaveBeenCalledWith(
        { short_code: 'abc123' },
        expect.objectContaining({
          safety_checked: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          safety_checked_at: expect.any(Date),
          is_active: true,
        }),
      );
    });

    it('should mark URL as checked and inactive when the API flags as unsafe', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: false,
        skipped: false,
        reason: 'api_checked',
      });

      await processOneMessage(testMessage);

      expect(urlRepository.update).toHaveBeenCalledWith(
        { short_code: 'abc123' },
        expect.objectContaining({
          safety_checked: true,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          safety_checked_at: expect.any(Date),
          is_active: false,
        }),
      );
    });

    it('should acknowledge the stream message after successful processing', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: false,
        reason: 'api_checked',
      });

      await processOneMessage(testMessage);

      expect(redisService.ackMessage).toHaveBeenCalledTimes(1);
      expect(redisService.ackMessage).toHaveBeenCalledWith(
        STREAM_NAME,
        GROUP_NAME,
        'msg-001',
      );
    });

    it('should acknowledge the message even when urlRepository.update throws', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: false,
        reason: 'api_checked',
      });
      urlRepository.update.mockRejectedValue(new Error('DB write failed'));

      await processOneMessage(testMessage);

      expect(redisService.ackMessage).toHaveBeenCalledTimes(1);
    });

    it('should log an error when urlRepository.update throws', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: false,
        reason: 'api_checked',
      });
      urlRepository.update.mockRejectedValue(new Error('DB write failed'));

      await processOneMessage(testMessage);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT acknowledge the message when checkUrl itself throws', async () => {
      safetyService.checkUrl.mockRejectedValue(new Error('API unreachable'));

      await processOneMessage(testMessage);

      expect(redisService.ackMessage).not.toHaveBeenCalled();
    });

    it('should NOT call urlRepository.update when checkUrl throws', async () => {
      safetyService.checkUrl.mockRejectedValue(new Error('API unreachable'));

      await processOneMessage(testMessage);

      expect(urlRepository.update).not.toHaveBeenCalled();
    });

    it('should log an error when checkUrl throws', async () => {
      safetyService.checkUrl.mockRejectedValue(new Error('API unreachable'));

      await processOneMessage(testMessage);

      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should process all messages in a single stream read', async () => {
      const messages = [
        makeMessage('msg-001', 'aaa111', 'https://first.com'),
        makeMessage('msg-002', 'bbb222', 'https://second.com'),
        makeMessage('msg-003', 'ccc333', 'https://third.com'),
      ];

      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: false,
        reason: 'api_checked',
      });

      let callCount = 0;
      redisService.readFromStream.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(messages);
        worker.onModuleDestroy();
        return Promise.resolve([]);
      });

      await worker['startConsuming']();

      expect(safetyService.checkUrl).toHaveBeenCalledTimes(3);
      expect(urlRepository.update).toHaveBeenCalledTimes(3);
      expect(redisService.ackMessage).toHaveBeenCalledTimes(3);
    });

    it('should call checkUrl with the correct URL from the message data', async () => {
      safetyService.checkUrl.mockResolvedValue({
        safe: true,
        skipped: false,
        reason: 'api_checked',
      });

      await processOneMessage(testMessage);

      expect(safetyService.checkUrl).toHaveBeenCalledWith(
        'https://some-url.com',
      );
    });
  });
});
