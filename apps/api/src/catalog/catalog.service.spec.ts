import { BadRequestException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../database/prisma.service';
import { DevicesService } from '../devices/devices.service';

describe('CatalogService', () => {
  const prisma: any = {
    productCategory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    topping: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    productVariant: { findUnique: jest.fn(), update: jest.fn() },
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    syncChange: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => cb(prisma)),
  };
  const devices: any = { authenticateDevice: jest.fn() };
  const service = new CatalogService(
    prisma as PrismaService,
    devices as DevicesService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('includes hidden products only for the web catalog query', async () => {
    devices.authenticateDevice.mockResolvedValue({ id: 'device-1' });
    prisma.product.findMany.mockResolvedValue([]);
    await service.getProducts('Device token');
    expect(prisma.product.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          category: { isActive: true },
          variants: { some: { isActive: true } },
        },
      }),
    );
    await service.getProducts('Device token', true);
    expect(prisma.product.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('lists actual topping prices and status', async () => {
    prisma.topping.findMany.mockResolvedValue([
      {
        id: 1n,
        code: 'TOP01',
        name: 'Trân châu',
        priceVnd: 10000n,
        isActive: true,
      },
    ]);
    await expect(service.getToppings()).resolves.toEqual([
      {
        id: '1',
        code: 'TOP01',
        name: 'Trân châu',
        priceVnd: '10000',
        isActive: true,
      },
    ]);
  });

  it('writes a complete product delta with a changed variant price', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 20n,
      productId: 10n,
    });
    prisma.productVariant.update.mockResolvedValue({
      id: 20n,
      productId: 10n,
      priceVnd: 39000n,
    });
    prisma.product.findUnique.mockResolvedValue({
      id: 10n,
      categoryId: 1n,
      code: 'CF01',
      name: 'Ca phe',
      description: null,
      isActive: true,
      variants: [
        {
          id: 20n,
          code: 'M',
          sizeLabel: 'M',
          priceVnd: 39000n,
          isDefault: true,
          isActive: true,
        },
      ],
      allowedToppings: [{ toppingId: 4n }],
    });
    const result = await service.updateVariantPrice(20n, '39000');
    expect(result.priceVnd).toBe('39000');
    expect(prisma.syncChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'products',
          payload: expect.objectContaining({
            categoryId: '1',
            allowedToppingIds: ['4'],
            variants: [expect.objectContaining({ priceVnd: '39000' })],
          }),
        }),
      }),
    );
  });

  it('writes category VAT and topping price deltas', async () => {
    prisma.productCategory.findUnique.mockResolvedValue({ id: 1n });
    prisma.productCategory.update.mockResolvedValue({
      id: 1n,
      name: 'Ca phe',
      sortOrder: 1,
      taxRateBps: 0,
      isActive: true,
      updatedAt: new Date('2026-10-09T00:00:00.000Z'),
    });
    await service.updateCategoryTax(1n, 0);
    expect(prisma.syncChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'product_categories',
          payload: expect.objectContaining({ taxRateBps: 0 }),
        }),
      }),
    );

    prisma.topping.findUnique.mockResolvedValue({ id: 4n });
    prisma.topping.update.mockResolvedValue({
      id: 4n,
      code: 'TOP04',
      name: 'Kem cheese',
      priceVnd: 12000n,
      isActive: true,
    });
    await service.updateToppingPrice(4n, '12000');
    expect(prisma.syncChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'toppings',
          payload: expect.objectContaining({ priceVnd: '12000' }),
        }),
      }),
    );
  });

  it('rejects invalid prices before a transaction', async () => {
    await expect(service.updateVariantPrice(20n, '-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns category VAT from category records', async () => {
    devices.authenticateDevice.mockResolvedValue({ id: 'device-1' });
    prisma.productCategory.findMany.mockResolvedValue([
      {
        id: 1n,
        name: 'Cà phê',
        sortOrder: 1,
        taxRateBps: 800,
        updatedAt: new Date('2026-09-26T00:00:00.000Z'),
      },
    ]);

    await expect(service.getCategories('Device token')).resolves.toEqual([
      {
        id: '1',
        name: 'Cà phê',
        sortOrder: 1,
        taxRateBps: 800,
        updatedAt: '2026-09-26T00:00:00.000Z',
      },
    ]);
    expect(devices.authenticateDevice).toHaveBeenCalledWith('Device token');
  });

  it('inherits VAT from category and exposes no product/topping override', async () => {
    devices.authenticateDevice.mockResolvedValue({ id: 'device-1' });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 10n,
        code: 'CF01',
        name: 'Cà phê sữa',
        description: null,
        updatedAt: new Date('2026-09-26T00:00:00.000Z'),
        category: { id: 1n, name: 'Cà phê', taxRateBps: 800 },
        variants: [
          {
            id: 20n,
            code: 'M',
            sizeLabel: 'M',
            priceVnd: 35000n,
            isDefault: true,
          },
        ],
        allowedToppings: [
          {
            topping: {
              id: 30n,
              code: 'TC',
              name: 'Trân châu',
              priceVnd: 10000n,
            },
          },
        ],
      },
    ]);

    const [product] = await service.getProducts('Device token');
    expect(product.category.taxRateBps).toBe(800);
    expect(product).not.toHaveProperty('taxRateBps');
    expect(product.toppings[0]).not.toHaveProperty('taxRateBps');
  });

  it('updates product status and emits syncChange in a single transaction', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 10n, code: 'CF01' });
    prisma.product.update.mockResolvedValue({
      id: 10n,
      code: 'CF01',
      name: 'Cà phê sữa',
      description: 'Mô tả',
      categoryId: 1n,
      isActive: false,
      variants: [
        {
          id: 20n,
          code: 'M',
          sizeLabel: 'M',
          priceVnd: 35000n,
          isDefault: true,
          isActive: true,
        },
      ],
      allowedToppings: [{ toppingId: 30n }],
    });

    const res = await service.updateProductStatus(10n, false);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.syncChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changeType: 'UPSERT',
          entityType: 'products',
          payload: expect.objectContaining({
            id: '10',
            categoryId: '1',
            isActive: false,
          }),
        }),
      }),
    );
    expect(res).toEqual({
      id: '10',
      code: 'CF01',
      name: 'Cà phê sữa',
      isActive: false,
    });
  });

  it('deletes product and emits DELETE syncChange in a single transaction', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 10n,
      code: 'CF01',
      name: 'Cà phê',
    });
    prisma.product.update.mockResolvedValue({ id: 10n, isActive: false });

    const res = await service.deleteProduct(10n);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.syncChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changeType: 'DELETE',
          entityType: 'products',
          payload: expect.objectContaining({
            id: '10',
            isActive: false,
          }),
        }),
      }),
    );
    expect(res).toEqual({ id: '10', deleted: true });
  });
});
