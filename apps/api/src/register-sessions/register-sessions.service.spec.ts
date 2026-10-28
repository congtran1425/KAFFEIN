import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { RegisterSessionsService } from './register-sessions.service';

describe('RegisterSessionsService', () => {
  let service: RegisterSessionsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(0),
      registerSession: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
      },
      cashierSession: {
        findFirst: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn((work) => work(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterSessionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RegisterSessionsService>(RegisterSessionsService);
  });

  describe('openSession', () => {
    it('should reject opening session if user belongs to foreign store', async () => {
      prisma.registerSession.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 102n,
        status: 'ACTIVE',
        homeStoreId: 2n, // foreign store
      });

      await expect(
        service.openSession(1n, 'dev-1', {
          openedByUserId: '102',
          openingCashVnd: 500000,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if another session is already open on device', async () => {
      prisma.registerSession.findFirst.mockResolvedValue({
        id: 'existing-sess',
        status: 'OPEN',
      });

      await expect(
        service.openSession(1n, 'dev-1', {
          openedByUserId: '101',
          openingCashVnd: 500000,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('closeSession', () => {
    it('should compute cash sales, expected cash and variance correctly', async () => {
      const sessionId = 'session-123';
      const deviceId = 'dev-1';
      const storeId = 1n;

      prisma.registerSession.findUnique.mockResolvedValue({
        id: sessionId,
        deviceId,
        storeId,
        status: 'OPEN',
        openingCashVnd: 1000000n, // Tiền đầu ca: 1,000,000
      });

      prisma.user.findUnique.mockResolvedValue({
        id: 101n,
        status: 'ACTIVE',
        homeStoreId: 1n,
      });

      // Doanh thu tiền mặt trong ca: 500,000 + 300,000 = 800,000
      prisma.payment.findMany.mockResolvedValue([
        { amountVnd: 500000n },
        { amountVnd: 300000n },
      ]);

      // Tiền thực tế nhân viên đếm: 1,750,000 (Thiếu 50,000)
      // expected = 1,000,000 + 800,000 = 1,800,000
      // variance = 1,750,000 - 1,800,000 = -50,000
      prisma.registerSession.update.mockImplementation((args) => ({
        ...args.data,
        id: sessionId,
        deviceId,
        storeId,
        openedByUserId: 101n,
        openingCashVnd: 1000000n,
        openedAt: new Date(),
      }));

      const res = await service.closeSession(storeId, deviceId, sessionId, {
        closedByUserId: '101',
        actualCashVnd: 1750000,
        compensationCashVnd: 50000,
        compensationDenominations: { '50000': 1 },
      });

      expect(res.expectedCashVnd).toBe('1800000');
      expect(res.actualCashVnd).toBe('1750000');
      expect(res.varianceVnd).toBe('-50000');
      expect(res.status).toBe('CLOSED');
    });
  });
});
