import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { CryptoUtil } from '../common/security/crypto.util';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    webCredential: { findFirst: jest.Mock; update: jest.Mock };
    store: { findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      webCredential: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      store: {
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('webLogin', () => {
    it('thất bại khi email không tồn tại', async () => {
      prisma.webCredential.findFirst.mockResolvedValue(null);

      await expect(
        service.webLogin({ email: 'unknown@test.vn', password: '123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('thất bại khi tài khoản bị SUSPENDED', async () => {
      prisma.webCredential.findFirst.mockResolvedValue({
        user: { status: 'SUSPENDED' },
      });

      await expect(
        service.webLogin({ email: 'locked@test.vn', password: '123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('thành công trả về JWT với role OWNER và homeStoreId null', async () => {
      const passwordHash = await CryptoUtil.hashPin('123456');
      prisma.webCredential.findFirst.mockResolvedValue({
        userId: 1n,
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        user: {
          id: 1n,
          fullName: 'Chủ Chuỗi Test',
          role: 'OWNER',
          homeStoreId: null,
          status: 'ACTIVE',
        },
      });
      prisma.webCredential.update.mockResolvedValue({});

      const res = await service.webLogin({
        email: 'owner@coffeepos.vn',
        password: '123456',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.role).toBe('OWNER');
      expect(res.homeStoreId).toBeNull();
      expect(res.fullName).toBe('Chủ Chuỗi Test');

      const verified = CryptoUtil.verifyJwt(
        res.accessToken,
        process.env.JWT_ACCESS_SECRET ||
          'local-development-access-secret-change-before-deploy',
      );
      expect(verified.role).toBe('OWNER');
      expect(verified.userId).toBe('1');
    });

    it('thành công trả về JWT với role STORE_MANAGER và homeStoreId', async () => {
      const passwordHash = await CryptoUtil.hashPin('123456');
      prisma.webCredential.findFirst.mockResolvedValue({
        userId: 2n,
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        user: {
          id: 2n,
          fullName: 'Cửa Hàng Trưởng Q1',
          role: 'STORE_MANAGER',
          homeStoreId: 101n,
          status: 'ACTIVE',
        },
      });
      prisma.webCredential.update.mockResolvedValue({});

      const res = await service.webLogin({
        email: 'Manager.Q1@CoffeePOS.vn',
        password: '123456',
      });

      expect(prisma.webCredential.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                email: {
                  equals: 'Manager.Q1@CoffeePOS.vn',
                  mode: 'insensitive',
                },
              },
            ]),
          }),
        }),
      );

      expect(res.accessToken).toBeDefined();
      expect(res.role).toBe('STORE_MANAGER');
      expect(res.homeStoreId).toBe('101');
      expect(res.fullName).toBe('Cửa Hàng Trưởng Q1');
    });
  });

  describe('getStores', () => {
    it('returns stores with activeDevice and revokedDeviceCount for OWNER', async () => {
      const now = new Date();
      prisma.store.findMany.mockResolvedValue([
        {
          id: 10001n,
          code: '10001',
          name: 'Chi nhánh Quận 1',
          address: '123 Đồng Khởi',
          devices: [
            {
              id: 'dev-active',
              displayName: 'POS Main',
              status: 'ACTIVE',
              appVersion: '1.2.0',
              lastHeartbeatAt: now,
              hasPendingOutbox: false,
              enrolledAt: now,
            },
            {
              id: 'dev-revoked-1',
              displayName: 'Old POS 1',
              status: 'REVOKED',
              appVersion: '1.0.0',
              lastHeartbeatAt: null,
              hasPendingOutbox: false,
              enrolledAt: new Date(now.getTime() - 1000000),
            },
          ],
        },
        {
          id: 10002n,
          code: '10002',
          name: 'Chi nhánh mới',
          address: '456 Lê Lợi',
          devices: [],
        },
      ]);

      const stores = await service.getStores('OWNER');

      expect(stores).toHaveLength(2);
      expect(stores[0].posDeviceId).toBe('dev-active');
      expect(stores[0].posOnline).toBe(true);
      expect(stores[0].activeDevice).toEqual({
        id: 'dev-active',
        displayName: 'POS Main',
        appVersion: '1.2.0',
        lastHeartbeatAt: now.toISOString(),
        isOnline: true,
        hasPendingOutbox: false,
      });
      expect(stores[0].revokedDeviceCount).toBe(1);

      expect(stores[1].posDeviceId).toBeNull();
      expect(stores[1].activeDevice).toBeNull();
      expect(stores[1].revokedDeviceCount).toBe(0);
    });
  });
});
