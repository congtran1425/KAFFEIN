import { Test, TestingModule } from '@nestjs/testing';
import { StoresService } from './stores.service';
import { PrismaService } from '../database/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('StoresService', () => {
  let service: StoresService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      store: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      ingredient: {
        findMany: jest.fn(),
      },
      stockBalance: {
        createMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StoresService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StoresService>(StoresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createStore', () => {
    it('throws ConflictException if store code already exists', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue({
        id: BigInt(1),
        code: '10001',
      });

      await expect(
        service.createStore(
          { code: '10001', name: 'Store 1', address: '123 Street' },
          BigInt(1),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates store, initializes 0 stock balances for ingredients, and writes audit log', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.store.create as jest.Mock).mockResolvedValue({
        id: BigInt(10003),
        code: '10003',
        name: 'Chi nhánh Quận 7',
        address: '123 Nguyễn Văn Linh',
        status: 'ACTIVE',
        createdAt: new Date(),
      });
      (prisma.ingredient.findMany as jest.Mock).mockResolvedValue([
        { id: BigInt(1) },
        { id: BigInt(2) },
      ]);
      (prisma.stockBalance.createMany as jest.Mock).mockResolvedValue({
        count: 2,
      });
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const res = await service.createStore(
        {
          code: '10003',
          name: 'Chi nhánh Quận 7',
          address: '123 Nguyễn Văn Linh',
        },
        BigInt(1),
      );

      expect(res.id).toBe('10003');
      expect(res.code).toBe('10003');
      expect(prisma.store.create).toHaveBeenCalledWith({
        data: {
          code: '10003',
          name: 'Chi nhánh Quận 7',
          address: '123 Nguyễn Văn Linh',
          status: 'ACTIVE',
        },
      });
      expect(prisma.stockBalance.createMany).toHaveBeenCalledWith({
        data: [
          {
            storeId: BigInt(10003),
            ingredientId: BigInt(1),
            quantity: 0,
            version: BigInt(1),
          },
          {
            storeId: BigInt(10003),
            ingredientId: BigInt(2),
            quantity: 0,
            version: BigInt(1),
          },
        ],
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'STORE_CREATED',
            entityType: 'stores',
            entityId: '10003',
          }),
        }),
      );
    });
  });

  describe('getStoreDevices', () => {
    it('throws NotFoundException if store does not exist', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getStoreDevices('99999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns store devices history', async () => {
      (prisma.store.findUnique as jest.Mock).mockResolvedValue({
        id: BigInt(10001),
        name: 'Chi nhánh Quận 1',
        devices: [
          {
            id: 'dev-1',
            displayName: 'POS 1',
            status: 'ACTIVE',
            appVersion: '1.0.0',
            enrolledAt: new Date(),
            lastHeartbeatAt: new Date(),
            revokedAt: null,
          },
        ],
      });

      const res = await service.getStoreDevices('10001');
      expect(res.storeId).toBe('10001');
      expect(res.devices).toHaveLength(1);
      expect(res.devices[0].status).toBe('ACTIVE');
    });
  });
});
