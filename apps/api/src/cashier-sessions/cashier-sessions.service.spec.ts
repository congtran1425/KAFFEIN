import { Test, TestingModule } from '@nestjs/testing';
import { CashierSessionsService } from './cashier-sessions.service';
import { PrismaService } from '../database/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CryptoUtil } from '../common/security/crypto.util';

describe('CashierSessionsService', () => {
  let service: CashierSessionsService;
  let prisma: any;
  let devicesService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      employeePinCredential: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ failedAttempts: 1 }),
      },
      cashierSession: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        const tx = {
          cashierSession: {
            updateMany: jest.fn(),
            create: jest.fn(),
          },
          employeePinCredential: {
            update: jest.fn(),
          },
        };
        return cb(tx);
      }),
    };

    devicesService = {
      authenticateDevice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashierSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DevicesService, useValue: devicesService },
      ],
    }).compile();

    service = module.get<CashierSessionsService>(CashierSessionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should successfully login cashier at their home store', async () => {
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-1',
        storeId: BigInt(1),
        store: { name: 'Chi nhánh Quận 1' },
      });

      const pinHash = await CryptoUtil.hashPin('1234');
      prisma.user.findUnique.mockResolvedValue({
        id: BigInt(101),
        fullName: 'Nguyễn Văn Thu Ngân',
        employeeCode: BigInt(1000001),
        status: 'ACTIVE',
        homeStoreId: BigInt(1), // Trùng với store của máy POS
        pinCredential: {
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      const res = await service.login('Bearer valid-token', {
        employeeCode: '1000001',
        pin: '1234',
      });

      expect(res.employeeCode).toBe('1000001');
      expect(res.employeeName).toBe('Nguyễn Văn Thu Ngân');
      expect(res.storeId).toBe('1');
      expect(res.sessionId).toBeDefined();
    });

    it('should THROW ForbiddenException if employee belongs to another store', async () => {
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-1',
        storeId: BigInt(1), // Máy POS ở Store 1
        store: { name: 'Chi nhánh Quận 1' },
      });

      const pinHash = await CryptoUtil.hashPin('1234');
      prisma.user.findUnique.mockResolvedValue({
        id: BigInt(102),
        fullName: 'Trần Thị Hỗ Trợ',
        employeeCode: BigInt(1000002),
        status: 'ACTIVE',
        homeStoreId: BigInt(2), // Home store là Store 2 (Đà Nẵng)
        pinCredential: {
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      await expect(
        service.login('Bearer valid-token', {
          employeeCode: '1000002',
          pin: '1234',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should THROW UnauthorizedException on invalid PIN', async () => {
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-1',
        storeId: BigInt(1),
        store: { name: 'Chi nhánh Quận 1' },
      });

      const pinHash = await CryptoUtil.hashPin('1234');
      prisma.user.findUnique.mockResolvedValue({
        id: BigInt(101),
        fullName: 'Nguyễn Văn Thu Ngân',
        employeeCode: BigInt(1000001),
        status: 'ACTIVE',
        homeStoreId: BigInt(1),
        pinCredential: {
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      await expect(
        service.login('Bearer valid-token', {
          employeeCode: '1000001',
          pin: '9999', // Sai PIN
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('locks the PIN for 15 minutes on the fifth failed cashier login', async () => {
      prisma.employeePinCredential.update.mockResolvedValueOnce({
        failedAttempts: 5,
      });
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-1',
        storeId: 1n,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 101n,
        status: 'ACTIVE',
        homeStoreId: 1n,
        pinCredential: {
          pinHash: await CryptoUtil.hashPin('1234'),
          failedAttempts: 4,
          lockedUntil: null,
        },
      });

      await expect(
        service.login('Device valid', { employeeCode: '1000001', pin: '9999' }),
      ).rejects.toThrow(UnauthorizedException);
      const attemptsUpdate =
        prisma.employeePinCredential.update.mock.calls[0][0];
      const lockUpdate = prisma.employeePinCredential.update.mock.calls[1][0];
      expect(attemptsUpdate.data.failedAttempts).toEqual({ increment: 1 });
      expect(lockUpdate.data.lockedUntil.getTime()).toBeGreaterThan(
        Date.now() + 14 * 60 * 1000,
      );
    });
  });
});
