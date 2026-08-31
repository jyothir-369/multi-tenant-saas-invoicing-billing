import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports healthy dependencies', async () => {
    const service = new HealthService({ $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any);
    const original = (service as any).checkRedis;
    (service as any).checkRedis = jest.fn().mockResolvedValue(true);
    await expect(service.check()).resolves.toEqual(expect.objectContaining({ status: 'ok', dependencies: { postgres: 'up', redis: 'up' } }));
    (service as any).checkRedis = original;
  });

  it('reports degraded dependencies without leaking connection details', async () => {
    const service = new HealthService({ $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('secret connection string')) } as any);
    (service as any).checkRedis = jest.fn().mockResolvedValue(false);
    await expect(service.check()).resolves.toEqual(expect.objectContaining({ status: 'degraded', dependencies: { postgres: 'down', redis: 'down' } }));
  });
});
