import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { PrismaService } from '../database/prisma.service';
import { CryptoUtil } from '../common/security/crypto.util';

describe('StoresController', () => {
  let controller: StoresController;
  let storesService: {
    createStore: jest.Mock;
    getStoreDevices: jest.Mock;
  };
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
  };

  const JWT_SECRET =
    process.env.JWT_ACCESS_SECRET ||
    'local-development-access-secret-change-before-deploy';

  const makeAuthHeader = (
    role: 'OWNER' | 'STORE_MANAGER' | 'EMPLOYEE',
    userId: string,
    homeStoreId: string | null = null,
  ) => {
    const token = CryptoUtil.signJwt(
      {
        sub: `user:${userId}`,
        userId,
        role,
        homeStoreId,
        storeScope: homeStoreId ? [homeStoreId] : '*',
      },
      JWT_SECRET,
      3600,
    );
    return `Bearer ${token}`;
  };

  beforeEach(async () => {
    storesService = {
      createStore: jest.fn(),
      getStoreDevices: jest.fn(),
    };
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoresController],
      providers: [
        { provide: StoresService, useValue: storesService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get<StoresController>(StoresController);
  });

  describe('createStore', () => {
    it('allows OWNER to create store', async () => {
      const authHeader = makeAuthHeader('OWNER', '1');
      prisma.user.findUnique.mockResolvedValue({
        id: 1n,
        status: 'ACTIVE',
      });
      storesService.createStore.mockResolvedValue({
        id: '10003',
        code: '10003',
      });

      const res = await controller.createStore(authHeader, {
        code: '10003',
        name: 'Chi nhánh Q7',
        address: '123 NTT',
      });

      expect(res.id).toBe('10003');
      expect(storesService.createStore).toHaveBeenCalled();
    });

    it('rejects non-owner with ForbiddenException', async () => {
      const authHeader = makeAuthHeader('STORE_MANAGER', '2', '10001');

      await expect(
        controller.createStore(authHeader, {
          code: '10003',
          name: 'Chi nhánh Q7',
          address: '123 NTT',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStoreDevices', () => {
    it('allows OWNER to view devices of any store', async () => {
      const authHeader = makeAuthHeader('OWNER', '1');
      storesService.getStoreDevices.mockResolvedValue({
        storeId: '10002',
        devices: [],
      });

      const res = await controller.getStoreDevices(authHeader, '10002');
      expect(res.storeId).toBe('10002');
      expect(storesService.getStoreDevices).toHaveBeenCalledWith('10002');
    });

    it('allows STORE_MANAGER to view devices of their own home store', async () => {
      const authHeader = makeAuthHeader('STORE_MANAGER', '2', '10001');
      storesService.getStoreDevices.mockResolvedValue({
        storeId: '10001',
        devices: [],
      });

      const res = await controller.getStoreDevices(authHeader, '10001');
      expect(res.storeId).toBe('10001');
      expect(storesService.getStoreDevices).toHaveBeenCalledWith('10001');
    });

    it('blocks STORE_MANAGER from viewing devices of another store with ForbiddenException', async () => {
      const authHeader = makeAuthHeader('STORE_MANAGER', '2', '10001');

      await expect(
        controller.getStoreDevices(authHeader, '10002'),
      ).rejects.toThrow(ForbiddenException);

      expect(storesService.getStoreDevices).not.toHaveBeenCalled();
    });
  });
});
