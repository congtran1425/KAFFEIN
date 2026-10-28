import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StockReceiptsService } from './stock-receipts.service';

describe('StockReceiptsService (Nhập hàng & Phiếu kho)', () => {
  const owner = { userId: '1', role: 'OWNER' as const };
  const managerStore1 = {
    userId: '2',
    role: 'STORE_MANAGER' as const,
    homeStoreId: '1',
  };
  const managerStore2 = {
    userId: '3',
    role: 'STORE_MANAGER' as const,
    homeStoreId: '2',
  };

  let prisma: any;
  let service: StockReceiptsService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      store: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1n, name: 'Chi nhánh Q1' }),
      },
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10n,
            code: 'ING_COFFEE_ROBUSTA',
            name: 'Hạt Robusta',
            baseUnit: 'G',
            isActive: true,
          },
          {
            id: 11n,
            code: 'ING_FRESH_MILK',
            name: 'Sữa tươi',
            baseUnit: 'ML',
            isActive: true,
          },
        ]),
      },
      device: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'dev-1',
          storeId: 1n,
          status: 'ACTIVE',
          lastHeartbeatAt: new Date(),
          lastSyncedAt: new Date(),
          hasPendingOutbox: false,
          outboxPendingCount: 0,
        }),
      },
      stockReceipt: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      stockReceiptLine: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      stockBalance: {
        findUnique: jest.fn().mockResolvedValue({
          storeId: 1n,
          ingredientId: 10n,
          quantity: new Prisma.Decimal(1000),
          version: 1n,
        }),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
      syncChange: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    service = new StockReceiptsService(prisma as PrismaService);
  });

  describe('Tạo phiếu nhập (createReceipt)', () => {
    it('cho phép Owner tạo phiếu nhập cho bất kỳ chi nhánh nào', async () => {
      prisma.stockReceipt.create.mockResolvedValue({
        id: 'rec-1',
        storeId: 1n,
        receiptCode: 'REC-20261009-1234',
        sourceType: 'EXTERNAL_SUPPLIER',
        sourceName: 'Nhà cung cấp A',
        documentNo: 'HD01',
        documentDate: new Date('2026-10-09'),
        status: 'DRAFT',
        totalCostVnd: 900000n,
        idempotencyKey: null,
        note: 'Giao sáng',
        rejectionReason: null,
        createdByUserId: 1n,
        createdByUser: { fullName: 'Võ Minh Anh' },
        reviewedByUserId: null,
        reviewedByUser: null,
        postedByUserId: null,
        postedByUser: null,
        postedAt: null,
        createdAt: new Date('2026-10-09T08:00:00Z'),
        updatedAt: new Date('2026-10-09T08:00:00Z'),
        lines: [
          {
            id: 'line-1',
            ingredientId: 10n,
            lineNumber: 1,
            receivedQuantity: new Prisma.Decimal(5000),
            baseUnit: 'G',
            unitCostVnd: new Prisma.Decimal(180),
            lineTotalVnd: 900000n,
            note: null,
            validationErrors: null,
            ingredient: { code: 'ING_COFFEE_ROBUSTA', name: 'Hạt Robusta' },
          },
        ],
      });

      const res = await service.createReceipt(owner, 1n, {
        sourceType: 'EXTERNAL_SUPPLIER',
        sourceName: 'Nhà cung cấp A',
        documentNo: 'HD01',
        lines: [
          { ingredientId: '10', receivedQuantity: 5000, unitCostVnd: 180 },
        ],
      });

      expect(res.receiptCode).toBe('REC-20261009-1234');
      expect(res.status).toBe('DRAFT');
      expect(res.totalCostVnd).toBe('900000');
      expect(prisma.stockReceipt.create).toHaveBeenCalled();
    });

    it('cho phép Store Manager tạo phiếu nhập cho chi nhánh nhà', async () => {
      prisma.stockReceipt.create.mockResolvedValue({
        id: 'rec-1',
        storeId: 1n,
        receiptCode: 'REC-20261009-1234',
        sourceType: 'CENTRAL_WAREHOUSE_UNTRACKED',
        sourceName: 'Kho cấp nguyên liệu',
        status: 'DRAFT',
        totalCostVnd: 360000n,
        createdByUserId: 2n,
        createdByUser: { fullName: 'Trần SM' },
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [],
      });

      const res = await service.createReceipt(managerStore1, 1n, {
        sourceType: 'CENTRAL_WAREHOUSE_UNTRACKED',
        sourceName: 'Kho cấp nguyên liệu',
        lines: [
          { ingredientId: '11', receivedQuantity: 10000, unitCostVnd: 36 },
        ],
      });

      expect(res.status).toBe('DRAFT');
      expect(prisma.stockReceipt.create).toHaveBeenCalled();
    });

    it('từ chối nếu Store Manager tạo phiếu cho chi nhánh khác (403 Forbidden)', async () => {
      await expect(
        service.createReceipt(managerStore2, 1n, {
          sourceType: 'EXTERNAL_SUPPLIER',
          sourceName: 'NCC',
          lines: [
            { ingredientId: '10', receivedQuantity: 1000, unitCostVnd: 180 },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('báo lỗi nếu nguyên liệu không tồn tại trong danh mục (400 Bad Request)', async () => {
      prisma.ingredient.findMany.mockResolvedValue([]);

      await expect(
        service.createReceipt(owner, 1n, {
          sourceType: 'EXTERNAL_SUPPLIER',
          sourceName: 'NCC',
          lines: [
            { ingredientId: '999', receivedQuantity: 1000, unitCostVnd: 180 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Đăng kho chính thức (postReceiptToStock)', () => {
    const mockDraftReceipt = {
      id: 'rec-1',
      storeId: 1n,
      receiptCode: 'REC-20261009-1234',
      sourceType: 'EXTERNAL_SUPPLIER',
      sourceName: 'NCC Bánh',
      status: 'DRAFT',
      totalCostVnd: 600000n,
      createdByUserId: 1n,
      createdByUser: { fullName: 'Owner' },
      idempotencyKey: null,
      lines: [
        {
          id: 'line-1',
          ingredientId: 10n,
          receivedQuantity: new Prisma.Decimal(2000),
          baseUnit: 'G',
          unitCostVnd: new Prisma.Decimal(180),
          lineTotalVnd: 360000n,
          validationErrors: null,
          ingredient: { code: 'ING_COFFEE_ROBUSTA', name: 'Hạt Robusta' },
        },
      ],
    };

    it('chặn đăng kho nếu máy POS của chi nhánh đang offline (heartbeat > 90s)', async () => {
      prisma.stockReceipt.findUnique.mockResolvedValue(mockDraftReceipt);
      prisma.device.findFirst.mockResolvedValue({
        id: 'dev-1',
        storeId: 1n,
        status: 'ACTIVE',
        lastHeartbeatAt: new Date(Date.now() - 150_000), // 150s trước
        lastSyncedAt: new Date(),
        hasPendingOutbox: false,
        outboxPendingCount: 0,
      });

      await expect(service.postReceiptToStock(owner, 'rec-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('chặn đăng kho nếu máy POS còn outbox chưa đồng bộ lên server', async () => {
      prisma.stockReceipt.findUnique.mockResolvedValue(mockDraftReceipt);
      prisma.device.findFirst.mockResolvedValue({
        id: 'dev-1',
        storeId: 1n,
        status: 'ACTIVE',
        lastHeartbeatAt: new Date(),
        lastSyncedAt: new Date(),
        hasPendingOutbox: true,
        outboxPendingCount: 3,
      });

      await expect(service.postReceiptToStock(owner, 'rec-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('chặn đăng kho nếu phiếu chứa dòng có lỗi validationErrors', async () => {
      prisma.stockReceipt.findUnique.mockResolvedValue({
        ...mockDraftReceipt,
        lines: [
          {
            id: 'line-1',
            lineNumber: 1,
            validationErrors: 'Mã nguyên liệu sai',
          },
        ],
      });

      await expect(service.postReceiptToStock(owner, 'rec-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('thực thi giao dịch nguyên tử khi POS online: tăng tồn kho, ghi movement RECEIPT, tạo sync_change, audit_log và POSTED', async () => {
      prisma.stockReceipt.findUnique.mockResolvedValue(mockDraftReceipt);
      prisma.stockBalance.update.mockResolvedValue({
        quantity: new Prisma.Decimal(3000),
      });
      prisma.stockReceipt.update.mockResolvedValue({
        ...mockDraftReceipt,
        status: 'POSTED',
        postedByUserId: 1n,
        postedByUser: { fullName: 'Võ Minh Anh' },
        postedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.postReceiptToStock(
        owner,
        'rec-1',
        'idem-uuid-1',
      );

      expect(res.status).toBe('POSTED');
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: 'RECEIPT',
            receiptLineId: 'line-1',
          }),
        }),
      );
      expect(prisma.syncChange.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: 'stock_balances',
            changeType: 'UPSERT',
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'STOCK_RECEIPT_POSTED',
          }),
        }),
      );
    });

    it('xử lý idempotency: trả về kết quả thành công nếu đã POSTED với cùng key mà không cộng kho lần 2', async () => {
      prisma.stockReceipt.findUnique.mockResolvedValue({
        ...mockDraftReceipt,
        status: 'POSTED',
        idempotencyKey: 'idem-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        postedAt: new Date(),
        createdByUser: { fullName: 'Owner' },
      });

      const res = await service.postReceiptToStock(
        owner,
        'rec-1',
        'idem-uuid-1',
      );

      expect(res.status).toBe('POSTED');
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('Từ chối phiếu (rejectReceipt)', () => {
    it('chuyển trạng thái phiếu sang REJECTED và lưu lý do từ chối', async () => {
      prisma.stockReceipt.findUnique.mockResolvedValue({
        id: 'rec-1',
        storeId: 1n,
        status: 'DRAFT',
      });
      prisma.stockReceipt.update.mockResolvedValue({
        id: 'rec-1',
        storeId: 1n,
        receiptCode: 'REC-01',
        sourceType: 'EXTERNAL_SUPPLIER',
        sourceName: 'NCC A',
        status: 'REJECTED',
        rejectionReason: 'Hàng hỏng bao bì',
        totalCostVnd: 0n,
        createdByUserId: 1n,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [],
      });

      const res = await service.rejectReceipt(owner, 'rec-1', {
        reason: 'Hàng hỏng bao bì',
      });

      expect(res.status).toBe('REJECTED');
      expect(prisma.stockReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
            rejectionReason: 'Hàng hỏng bao bì',
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'STOCK_RECEIPT_REJECTED',
          }),
        }),
      );
    });

    it('chặn từ chối nếu phiếu đã ở trạng thái POSTED', async () => {
      prisma.stockReceipt.findUnique.mockResolvedValue({
        id: 'rec-1',
        storeId: 1n,
        status: 'POSTED',
      });

      await expect(
        service.rejectReceipt(owner, 'rec-1', {
          reason: 'Từ chối sau khi đăng',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
