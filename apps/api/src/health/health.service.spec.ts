import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { PrismaService } from '../database/prisma.service';

describe('HealthService', () => {
  it('reports a healthy database', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ one: 1 }]) };
    const service = new HealthService(prisma as unknown as PrismaService);

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'ok',
    });
  });

  it('returns 503 when the database is unavailable', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('down')),
    };
    const service = new HealthService(prisma as unknown as PrismaService);

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
