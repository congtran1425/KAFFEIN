import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { PrismaService } from '../database/prisma.service';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CryptoUtil } from '../common/security/crypto.util';

describe('DevicesService', () => {
  let service: DevicesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      store: {
        findUnique: jest.fn(),
      },
      device: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      deviceActivationCode: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DevicesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createActivationCode', () => {
    it('should throw NotFoundException if store does not exist', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createActivationCode({ storeId: '999' }, BigInt(1)),
      ).rejects.toThrow(NotFoundException);
    });

    it('should generate activation code when store exists', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue({
        id: BigInt(1),
        name: 'Store 1',
        code: 'S01',
        status: 'ACTIVE',
      });
      (prisma.deviceActivationCode.create as jest.Mock).mockResolvedValue({
        id: 'act-1',
        codeLookup: 'abc',
      });

      const res = await service.createActivationCode(
        { storeId: '1' },
        BigInt(1),
      );
      expect(res.activationCode).toContain('.');
      expect(res.storeId).toBe('1');
    });

    it('rejects a second active POS without creating an activation code', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue({
        id: BigInt(1),
        status: 'ACTIVE',
      });
      (prisma.device.findFirst as jest.Mock).mockResolvedValue({
        id: 'device-1',
      });

      await expect(
        service.createActivationCode({ storeId: '1' }, BigInt(1)),
      ).rejects.toThrow(ConflictException);
      expect(prisma.deviceActivationCode.create).not.toHaveBeenCalled();
    });

    it('allows issuing an activation code with reissue=true for a store with an active POS', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue({
        id: BigInt(1),
        status: 'ACTIVE',
      });
      (prisma.device.findFirst as jest.Mock).mockResolvedValue({
        id: 'device-1',
      });
      (prisma.deviceActivationCode.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.deviceActivationCode.create as jest.Mock).mockResolvedValue({
        id: 'act-2',
        codeLookup: 'def',
      });

      const res = await service.createActivationCode(
        { storeId: '1', reissue: true },
        BigInt(1),
      );
      expect(res.activationCode).toContain('.');
      expect(prisma.deviceActivationCode.updateMany).toHaveBeenCalled();
      expect(prisma.deviceActivationCode.create).toHaveBeenCalled();
    });
  });

  describe('enrollDevice', () => {
    it('should throw UnprocessableEntityException if activation code format is invalid', async () => {
      await expect(
        service.enrollDevice({
          activationCode: 'invalidcode',
          displayName: 'POS Sunmi',
          appVersion: '1.0.0',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('revokes the old active device and enrolls the new device safely in transaction when code has replacement intent', async () => {
      const secret = 'validsecret';
      const secretHash = CryptoUtil.sha256(secret);

      (prisma.deviceActivationCode.findUnique as jest.Mock).mockResolvedValue({
        id: 'act-1',
        codeLookup: 'lookup1',
        secretHash,
        storeId: BigInt(1),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        usedByDeviceId: null,
        revokedAt: null,
        isReplacement: true,
        store: { id: BigInt(1), name: 'Store 1' },
      });

      (prisma.device.findFirst as jest.Mock).mockResolvedValue({
        id: 'old-device-id',
        storeId: BigInt(1),
        status: 'ACTIVE',
      });
      (prisma.device.update as jest.Mock).mockResolvedValue({});
      prisma.cashierSession = {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      prisma.auditLog = { create: jest.fn().mockResolvedValue({}) };
      (prisma.device.create as jest.Mock).mockResolvedValue({
        id: 'new-device-id',
      });
      (prisma.deviceActivationCode.update as jest.Mock).mockResolvedValue({});

      const res = await service.enrollDevice({
        activationCode: `lookup1.${secret}`,
        displayName: 'New POS Tablet',
        appVersion: '1.0.1',
      });

      expect(res.deviceId).toBeDefined();
      expect(res.storeName).toBe('Store 1');
      expect(prisma.device.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-device-id' },
          data: expect.objectContaining({ status: 'REVOKED' }),
        }),
      );
      expect(prisma.device.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'New POS Tablet',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('throws ConflictException if code is not for replacement but store already has an active device', async () => {
      const secret = 'validsecret';
      const secretHash = CryptoUtil.sha256(secret);

      (prisma.deviceActivationCode.findUnique as jest.Mock).mockResolvedValue({
        id: 'act-1',
        codeLookup: 'lookup1',
        secretHash,
        storeId: BigInt(1),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        usedByDeviceId: null,
        revokedAt: null,
        isReplacement: false,
        store: { id: BigInt(1), name: 'Store 1' },
      });

      (prisma.device.findFirst as jest.Mock).mockResolvedValue({
        id: 'old-device-id',
        storeId: BigInt(1),
        status: 'ACTIVE',
      });

      await expect(
        service.enrollDevice({
          activationCode: `lookup1.${secret}`,
          displayName: 'New POS Tablet',
          appVersion: '1.0.1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('revokeDevice', () => {
    it('throws NotFoundException if device does not exist', async () => {
      (prisma.device.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.revokeDevice('non-existent', BigInt(1)),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if device is already revoked', async () => {
      (prisma.device.findUnique as jest.Mock).mockResolvedValue({
        id: 'dev-1',
        status: 'REVOKED',
      });

      await expect(service.revokeDevice('dev-1', BigInt(1))).rejects.toThrow(
        ConflictException,
      );
    });

    it('revokes an active device and audits the action', async () => {
      (prisma.device.findUnique as jest.Mock).mockResolvedValue({
        id: 'dev-1',
        storeId: BigInt(1),
        status: 'ACTIVE',
      });
      (prisma.device.update as jest.Mock).mockResolvedValue({});
      prisma.cashierSession = {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      prisma.auditLog = { create: jest.fn().mockResolvedValue({}) };

      const res = await service.revokeDevice('dev-1', BigInt(1));
      expect(res.success).toBe(true);
      expect(res.status).toBe('REVOKED');
      expect(prisma.device.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dev-1' },
          data: expect.objectContaining({ status: 'REVOKED' }),
        }),
      );
    });
  });
});
