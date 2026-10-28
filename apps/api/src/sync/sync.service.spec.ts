import { Test, TestingModule } from '@nestjs/testing';
import { CryptoUtil } from '../common/security/crypto.util';
import { PrismaService } from '../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { RegisterSessionsService } from '../register-sessions/register-sessions.service';
import { SalesService } from '../sales/sales.service';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: any;
  let salesService: any;
  let inventoryService: any;
  let registerSessionsService: any;

  beforeEach(async () => {
    prisma = {
      syncOperation: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      device: {
        update: jest.fn(),
      },
      store: {
        findUniqueOrThrow: jest.fn(),
      },
      productCategory: {
        findMany: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
      topping: {
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      deviceSyncCheckpoint: {
        upsert: jest.fn(),
      },
      syncChange: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      ingredient: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      recipeVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      toppingItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockBalance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    };

    salesService = {
      completeSale: jest.fn(),
      completeSaleInsideTx: jest.fn(),
    };
    inventoryService = {
      adjustStock: jest.fn(),
      adjustStockInsideTx: jest.fn(),
    };
    registerSessionsService = {
      openSession: jest.fn(),
      openSessionInsideTx: jest.fn(),
      closeSession: jest.fn(),
      closeSessionInsideTx: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: SalesService, useValue: salesService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: RegisterSessionsService, useValue: registerSessionsService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  describe('pushOperations - Idempotency', () => {
    it('should process new operation and record to sync_operations', async () => {
      const storeId = 1n;
      const deviceId = 'dev-001';
      const opPayload = { saleNumber: 'S01-001', totalVnd: 50000 };
      const operationId = 'op-1234-uuid';

      prisma.syncOperation.findUnique.mockResolvedValue(null);
      salesService.completeSaleInsideTx.mockResolvedValue({
        id: 'sale-001',
        status: 'PAID',
      });
      prisma.syncOperation.create.mockResolvedValue({});
      prisma.device.update.mockResolvedValue({});

      const result = await service.pushOperations(storeId, deviceId, {
        operations: [
          {
            operationId,
            type: 'CASH_SALE_COMPLETED',
            payload: opPayload,
          },
        ],
      });

      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe('COMPLETED');
      expect(salesService.completeSaleInsideTx).toHaveBeenCalledTimes(1);
      expect(prisma.syncOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operationId,
            deviceId,
            storeId,
            operationType: 'CASH_SALE_COMPLETED',
            status: 'COMPLETED',
          }),
        }),
      );
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { lastSyncedAt: expect.any(Date) },
      });
    });

    it('should return cached result for duplicate operation with identical payload', async () => {
      const storeId = 1n;
      const deviceId = 'dev-001';
      const opPayload = { saleNumber: 'S01-001', totalVnd: 50000 };
      const operationId = 'op-1234-uuid';
      const payloadHash = CryptoUtil.sha256(JSON.stringify(opPayload));

      prisma.syncOperation.findUnique.mockResolvedValue({
        operationId,
        payloadHash,
        status: 'COMPLETED',
        result: { id: 'sale-001', status: 'PAID', cached: true },
      });
      prisma.device.update.mockResolvedValue({});

      const result = await service.pushOperations(storeId, deviceId, {
        operations: [
          {
            operationId,
            type: 'CASH_SALE_COMPLETED',
            payload: opPayload,
          },
        ],
      });

      expect(result.processed).toHaveLength(1);
      expect(result.processed[0].status).toBe('ALREADY_PROCESSED');
      expect(result.processed[0].result).toEqual({
        id: 'sale-001',
        status: 'PAID',
        cached: true,
      });
      expect(salesService.completeSaleInsideTx).not.toHaveBeenCalled();
    });

    it('should reject with 409 error when same operationId has different payload', async () => {
      const storeId = 1n;
      const deviceId = 'dev-001';
      const originalPayload = { saleNumber: 'S01-001', totalVnd: 50000 };
      const alteredPayload = { saleNumber: 'S01-001', totalVnd: 999999 };
      const operationId = 'op-1234-uuid';

      const originalHash = CryptoUtil.sha256(JSON.stringify(originalPayload));

      prisma.syncOperation.findUnique.mockResolvedValue({
        operationId,
        payloadHash: originalHash,
        status: 'COMPLETED',
        result: { id: 'sale-001' },
      });
      prisma.device.update.mockResolvedValue({});

      const result = await service.pushOperations(storeId, deviceId, {
        operations: [
          {
            operationId,
            type: 'CASH_SALE_COMPLETED',
            payload: alteredPayload,
          },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].status).toBe('REJECTED');
      expect(result.errors[0].error).toContain(
        '409 OPERATION_PAYLOAD_MISMATCH',
      );
      expect(salesService.completeSaleInsideTx).not.toHaveBeenCalled();
    });
  });

  describe('pullChanges - Cold Sync & Security', () => {
    it.each(['-1', 'bad', '', '1.5', '9223372036854775808'])(
      'rejects invalid cursor %s without database access',
      async (cursor) => {
        await expect(
          service.pullChanges(1n, 'device-1', { cursor }),
        ).rejects.toThrow('Invalid sync cursor');
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('keeps active flags and inactive variants in one repeatable-read snapshot', async () => {
      prisma.store.findUniqueOrThrow.mockResolvedValue({
        id: 1n,
        code: 'S',
        name: 'Store',
        address: '',
      });
      prisma.syncChange.findFirst.mockResolvedValue({ cursor: 12n });
      prisma.productCategory.findMany.mockResolvedValue([
        {
          id: 10n,
          name: 'Hidden',
          sortOrder: 1,
          taxRateBps: 0,
          isActive: false,
        },
      ]);
      prisma.product.findMany.mockResolvedValue([
        {
          id: 20n,
          categoryId: 10n,
          code: 'P',
          name: 'Product',
          description: null,
          isActive: false,
          variants: [
            {
              id: 30n,
              code: 'M',
              sizeLabel: 'M',
              priceVnd: 35000n,
              isDefault: true,
              isActive: false,
            },
          ],
          allowedToppings: [{ toppingId: 40n }],
        },
      ]);
      prisma.topping.findMany.mockResolvedValue([
        {
          id: 40n,
          code: 'T',
          name: 'Topping',
          priceVnd: 5000n,
          isActive: false,
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);
      const snapshot = await service.pullChanges(1n, 'device-1', {
        cursor: '0',
        limit: 1,
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      expect(snapshot.nextCursor).toBe('12');
      expect(snapshot.hasMore).toBe(false);
      expect(snapshot.changes).toHaveLength(4); // cold snapshot is not truncated by delta limit
      for (const type of ['product_categories', 'products', 'toppings']) {
        expect(
          snapshot.changes.find((change) => change.entityType === type)?.payload
            .isActive,
        ).toBe(false);
      }
      expect(
        snapshot.changes.find((change) => change.entityType === 'products')
          ?.payload.variants[0].isActive,
      ).toBe(false);
    });

    it('paginates delta and limits stock changes to the enrolled store', async () => {
      prisma.syncChange.findMany.mockResolvedValue(
        [11n, 12n, 13n].map((cursor) => ({
          cursor,
          entityType: 'stock_balances',
          entityId: '40',
          changeType: 'UPSERT',
          payload: {},
          changedAt: new Date(),
        })),
      );
      const page = await service.pullChanges(1n, 'device-1', {
        cursor: '10',
        limit: 2,
      });
      expect(prisma.syncChange.findMany).toHaveBeenCalledWith({
        where: {
          cursor: { gt: 10n },
          OR: [{ storeId: null }, { storeId: 1n }],
        },
        orderBy: { cursor: 'asc' },
        take: 3,
      });
      expect(page.nextCursor).toBe('12');
      expect(page.hasMore).toBe(true);
      expect(page.changes).toHaveLength(2);
    });

    it('should return snapshot without employee pinHash on cursor 0', async () => {
      const storeId = 1n;
      const deviceId = 'dev-001';

      prisma.store.findUniqueOrThrow.mockResolvedValue({
        id: 1n,
        code: 'STORE-01',
        name: 'Chi nhánh 1',
        address: '123 HCM',
      });
      prisma.productCategory.findMany.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.topping.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 101n,
          employeeCode: 1000001n,
          fullName: 'Nhân viên A',
          role: 'EMPLOYEE',
          pinCredential: {
            pinVersion: 2,
            pinHash: '$scrypt$secret$hash-that-must-never-leak',
          },
        },
      ]);
      prisma.deviceSyncCheckpoint.upsert.mockResolvedValue({});

      const res = await service.pullChanges(storeId, deviceId, { cursor: '0' });

      expect(res.changes.length).toBeGreaterThan(0);
      const employeeChange = res.changes.find(
        (c) => c.entityType === 'employees',
      );
      expect(employeeChange).toBeDefined();
      expect(employeeChange?.payload.fullName).toBe('Nhân viên A');
      expect(employeeChange?.payload.pinVersion).toBe(2);
      // TUYỆT ĐỐI KHÔNG leak pinHash
      expect(employeeChange?.payload.pinHash).toBeUndefined();
    });
  });
});
