import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SalesService } from './sales.service';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: any;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      cashierSession: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn(),
      },
      registerSession: {
        findUnique: jest.fn(),
      },
      productVariant: {
        findMany: jest.fn(),
      },
      topping: {
        findMany: jest.fn(),
      },
      sale: {
        create: jest.fn().mockImplementation((args) => args.data),
      },
      saleItem: {
        create: jest.fn(),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      stockBalance: {
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockTx)),
      user: mockTx.user,
      productVariant: mockTx.productVariant,
      topping: mockTx.topping,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  describe('completeSale', () => {
    it('should reject cashier if homeStoreId does not match device storeId', async () => {
      const storeId = 1n;
      const deviceId = 'dev-1';
      mockTx.cashierSession.findFirst.mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue({
        id: 102n,
        fullName: 'Nhân viên Quận 3',
        status: 'ACTIVE',
        homeStoreId: 2n, // Khác storeId=1n
      });

      await expect(
        service.completeSale(storeId, deviceId, {
          cashierUserId: '102',
          items: [],
          payment: { method: 'CASH', amountVnd: 50000 },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should calculate inclusive VAT, recipe consumptions, and execute transaction with row lock', async () => {
      const storeId = 1n;
      const deviceId = 'dev-1';

      mockTx.cashierSession.findFirst.mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue({
        id: 101n,
        fullName: 'Thu ngân Quận 1',
        status: 'ACTIVE',
        homeStoreId: 1n,
      });

      // Variant M của Cà phê sữa (VAT 10% = 1000 bps)
      mockTx.productVariant.findMany.mockResolvedValue([
        {
          id: 10n,
          productId: 1n,
          code: 'M',
          sizeLabel: 'M',
          priceVnd: 35000n,
          product: {
            name: 'Cà phê sữa đá',
            category: { taxRateBps: 1000 },
          },
          recipeVersions: [
            {
              id: 1n,
              items: [
                {
                  ingredientId: 101n, // Hạt cà phê
                  quantity: new Prisma.Decimal(20),
                  ingredient: { name: 'Hạt cà phê Robusta', baseUnit: 'G' },
                },
                {
                  ingredientId: 102n, // Sữa đặc
                  quantity: new Prisma.Decimal(30),
                  ingredient: { name: 'Sữa đặc', baseUnit: 'G' },
                },
              ],
            },
          ],
        },
      ]);

      mockTx.topping.findMany.mockResolvedValue([]);
      mockTx.$queryRaw.mockResolvedValue([
        { quantity: new Prisma.Decimal(1000), version: 1n },
      ]);

      const res = await service.completeSale(storeId, deviceId, {
        cashierUserId: '101',
        items: [
          {
            productId: '1',
            productVariantId: '10',
            quantity: 2,
          },
        ],
        payment: {
          method: 'CASH',
          amountVnd: 70000,
        },
      });

      // Tổng tiền = 35,000 * 2 = 70,000 VND
      expect(res.totalVnd).toBe('70000');
      // Inclusive VAT 10%: subtotal = 70000 * 10000 / 11000 = 63636 VND
      expect(res.subtotalVnd).toBe('63636');
      // VAT = 70000 - 63636 = 6364 VND
      expect(res.taxVnd).toBe('6364');

      // Kiểm tra tiêu hao: 2 ly cà phê -> 40g hạt cà phê, 60g sữa đặc
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(mockTx.stockBalance.update).toHaveBeenCalledTimes(2);
      expect(mockTx.stockMovement.create).toHaveBeenCalledTimes(2);
    });

    it('should reject sale if stock is insufficient', async () => {
      const storeId = 1n;
      const deviceId = 'dev-1';

      mockTx.cashierSession.findFirst.mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue({
        id: 101n,
        fullName: 'Thu ngân Quận 1',
        status: 'ACTIVE',
        homeStoreId: 1n,
      });

      mockTx.productVariant.findMany.mockResolvedValue([
        {
          id: 10n,
          productId: 1n,
          code: 'M',
          sizeLabel: 'M',
          priceVnd: 35000n,
          product: { name: 'Cà phê', category: { taxRateBps: 0 } },
          recipeVersions: [
            {
              id: 1n,
              items: [
                {
                  ingredientId: 101n,
                  quantity: new Prisma.Decimal(500),
                  ingredient: { name: 'Hạt cà phê Robusta', baseUnit: 'G' },
                },
              ],
            },
          ],
        },
      ]);
      mockTx.topping.findMany.mockResolvedValue([]);
      // Tồn kho chỉ còn 10g nhưng cần 500g
      mockTx.$queryRaw.mockResolvedValue([
        { quantity: new Prisma.Decimal(10), version: 1n },
      ]);

      await expect(
        service.completeSale(storeId, deviceId, {
          cashierUserId: '101',
          items: [{ productId: '1', productVariantId: '10', quantity: 1 }],
          payment: { method: 'CASH', amountVnd: 35000 },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSales', () => {
    it('counts and paginates only paid invoices, including when filtering ZaloPay', async () => {
      prisma.sale = {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getSales({
        requestingRole: 'STORE_MANAGER',
        requestingHomeStoreId: 1n,
        paymentMethod: 'ZALOPAY',
        fromDate: '2026-10-01T00:00:00.000Z',
        toDate: '2026-10-12T23:59:59.999Z',
      });

      const countWhere = prisma.sale.count.mock.calls[0][0].where;
      const pageWhere = prisma.sale.findMany.mock.calls[0][0].where;
      expect(countWhere).toEqual({
        status: 'PAID',
        storeId: 1n,
        payments: { some: { method: 'ZALOPAY', status: 'PAID' } },
        completedAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lte: new Date('2026-10-12T23:59:59.999Z'),
        },
      });
      expect(pageWhere).toEqual(countWhere);
      expect(prisma.sale.findMany.mock.calls[0][0].orderBy).toEqual([
        { completedAt: 'desc' },
        { createdAt: 'desc' },
      ]);
      expect(result.total).toBe(1);
    });

    it('shows the successful payment method when a sale has an expired attempt', async () => {
      const completedAt = new Date('2026-10-12T07:00:00.000Z');
      prisma.sale = {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sale-1',
            saleNumber: 'S-1',
            storeId: 1n,
            store: { name: 'Quận 1' },
            cashierUser: { fullName: 'Thu ngân' },
            status: 'PAID',
            subtotalVnd: 48000n,
            taxVnd: 0n,
            totalVnd: 48000n,
            completedAt,
            createdAt: completedAt,
            payments: [
              { method: 'ZALOPAY', status: 'EXPIRED' },
              { method: 'CASH', status: 'PAID' },
            ],
            _count: { items: 1 },
          },
        ]),
      };

      const result = await service.getSales({ requestingRole: 'OWNER' });

      expect(result.items[0].paymentMethod).toBe('Tiền mặt');
    });
  });
});
