import {
  lockStoreCheckout,
  assertNoPendingOnlinePayment,
} from '../common/payment-store-lock';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { WebManagerPrincipal } from '../common/security/web-principal.util';
import {
  CreateStockReceiptDto,
  ImportCsvReceiptDto,
  PaginatedStockReceiptsResponseDto,
  QueryStockReceiptsDto,
  RejectStockReceiptDto,
  StockReceiptListItemDto,
  StockReceiptResponseDto,
  UpdateStockReceiptDto,
} from './dto/stock-receipts.dto';

@Injectable()
export class StockReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  private checkStoreScope(
    principal: WebManagerPrincipal,
    targetStoreId: bigint,
  ): void {
    if (
      principal.role === 'STORE_MANAGER' &&
      principal.homeStoreId !== targetStoreId.toString()
    ) {
      throw new ForbiddenException(
        'Quản lý chi nhánh chỉ được phép thao tác trên chính chi nhánh nhà của mình.',
      );
    }
  }

  private generateReceiptCode(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `REC-${yyyy}${mm}${dd}-${rand}`;
  }

  private formatReceiptResponse(receipt: any): StockReceiptResponseDto {
    return {
      id: receipt.id,
      storeId: receipt.storeId.toString(),
      receiptCode: receipt.receiptCode,
      sourceType: receipt.sourceType,
      sourceName: receipt.sourceName,
      documentNo: receipt.documentNo ?? null,
      documentDate: receipt.documentDate
        ? receipt.documentDate.toISOString()
        : null,
      status: receipt.status,
      totalCostVnd: receipt.totalCostVnd.toString(),
      idempotencyKey: receipt.idempotencyKey ?? null,
      note: receipt.note ?? null,
      rejectionReason: receipt.rejectionReason ?? null,
      createdByUserId: receipt.createdByUserId
        ? receipt.createdByUserId.toString()
        : '1',
      createdByName: receipt.createdByUser?.fullName ?? 'N/A',
      reviewedByUserId: receipt.reviewedByUserId
        ? receipt.reviewedByUserId.toString()
        : null,
      reviewedByName: receipt.reviewedByUser?.fullName ?? null,
      postedByUserId: receipt.postedByUserId
        ? receipt.postedByUserId.toString()
        : null,
      postedByName: receipt.postedByUser?.fullName ?? null,
      postedAt: receipt.postedAt ? receipt.postedAt.toISOString() : null,
      createdAt: receipt.createdAt.toISOString(),
      updatedAt: receipt.updatedAt.toISOString(),
      lines: (receipt.lines || []).map((l: any) => ({
        id: l.id,
        ingredientId: l.ingredientId.toString(),
        ingredientCode: l.ingredient?.code ?? 'N/A',
        ingredientName: l.ingredient?.name ?? 'N/A',
        lineNumber: l.lineNumber,
        receivedQuantity: Number(l.receivedQuantity),
        baseUnit: l.baseUnit,
        unitCostVnd: l.unitCostVnd.toString(),
        lineTotalVnd: l.lineTotalVnd.toString(),
        note: l.note ?? null,
        validationErrors: l.validationErrors ?? null,
      })),
    };
  }

  async createReceipt(
    principal: WebManagerPrincipal,
    storeId: bigint,
    dto: CreateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    this.checkStoreScope(principal, storeId);

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) {
      throw new NotFoundException(`Chi nhánh ${storeId} không tồn tại.`);
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(
        'Phiếu nhập phải chứa ít nhất một dòng nguyên liệu.',
      );
    }

    const ingredientIds = dto.lines.map((l) => BigInt(l.ingredientId));
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
    });
    const ingMap = new Map(ingredients.map((i) => [i.id.toString(), i]));

    for (const line of dto.lines) {
      const ing = ingMap.get(line.ingredientId);
      if (!ing) {
        throw new BadRequestException(
          `Nguyên liệu ID ${line.ingredientId} không tồn tại trong danh mục chuẩn.`,
        );
      }
      if (!ing.isActive) {
        throw new BadRequestException(
          `Nguyên liệu [${ing.name}] đang bị vô hiệu hóa, không thể nhập hàng.`,
        );
      }
    }

    const now = new Date();
    const receiptId = randomUUID();
    let totalCost = 0n;

    const linesCreateData = dto.lines.map((line, index) => {
      const ing = ingMap.get(line.ingredientId)!;
      const qtyDecimal = new Prisma.Decimal(line.receivedQuantity);
      const unitCostDecimal = new Prisma.Decimal(line.unitCostVnd);
      const lineTotal = BigInt(
        Math.round(line.receivedQuantity * line.unitCostVnd),
      );
      totalCost += lineTotal;

      return {
        id: randomUUID(),
        ingredientId: ing.id,
        lineNumber: index + 1,
        receivedQuantity: qtyDecimal,
        baseUnit: ing.baseUnit,
        unitCostVnd: unitCostDecimal,
        lineTotalVnd: lineTotal,
        note: line.note ?? null,
      };
    });

    const receipt = await this.prisma.stockReceipt.create({
      data: {
        id: receiptId,
        storeId,
        receiptCode: this.generateReceiptCode(now),
        sourceType: dto.sourceType,
        sourceName: dto.sourceName.trim(),
        documentNo: dto.documentNo?.trim() ?? null,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
        status: 'DRAFT',
        totalCostVnd: totalCost,
        note: dto.note?.trim() ?? null,
        createdByUserId: BigInt(principal.userId),
        lines: {
          create: linesCreateData,
        },
      },
      include: {
        store: true,
        createdByUser: true,
        reviewedByUser: true,
        postedByUser: true,
        lines: { include: { ingredient: true } },
      },
    });

    return this.formatReceiptResponse(receipt);
  }

  async importCsvReceipt(
    principal: WebManagerPrincipal,
    storeId: bigint,
    dto: ImportCsvReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    this.checkStoreScope(principal, storeId);

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) {
      throw new NotFoundException(`Chi nhánh ${storeId} không tồn tại.`);
    }

    const lines = dto.csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new BadRequestException(
        'File CSV phải chứa ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu.',
      );
    }

    // Nạp toàn bộ danh mục nguyên liệu active để mapping
    const allIngredients = await this.prisma.ingredient.findMany({
      where: { isActive: true },
    });
    const ingCodeMap = new Map(
      allIngredients.map((i) => [i.code.toUpperCase(), i]),
    );

    const now = new Date();
    const receiptId = randomUUID();
    let totalCost = 0n;
    const linesCreateData: any[] = [];

    // Bỏ qua header dòng 0, duyệt từ dòng 1
    for (let i = 1; i < lines.length; i++) {
      const rawCols = lines[i]
        .split(',')
        .map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (rawCols.length < 3) continue;

      let code = rawCols[0].toUpperCase();
      // Chống formula injection: nếu bắt đầu bằng =, +, -, @ thì làm sạch
      if (/^[=+\-@]/.test(code)) {
        code = code.replace(/^[=+\-@]+/, '');
      }

      const rawQty = parseFloat(rawCols[1]);
      const rawUnitCost = parseFloat(rawCols[2]);
      const note = rawCols[3] ? rawCols[3].slice(0, 200) : null;

      const ing = ingCodeMap.get(code);
      const errors: string[] = [];

      if (!ing) {
        errors.push(`Mã nguyên liệu [${code}] không tồn tại.`);
      }
      if (isNaN(rawQty) || rawQty <= 0) {
        errors.push('Số lượng nhận phải là số dương lớn hơn 0.');
      }
      if (isNaN(rawUnitCost) || rawUnitCost < 0) {
        errors.push('Đơn giá không được âm.');
      }

      const receivedQty = isNaN(rawQty) || rawQty <= 0 ? 0 : rawQty;
      const unitCost = isNaN(rawUnitCost) || rawUnitCost < 0 ? 0 : rawUnitCost;
      const lineTotal = BigInt(Math.round(receivedQty * unitCost));

      if (errors.length === 0) {
        totalCost += lineTotal;
      }

      linesCreateData.push({
        id: randomUUID(),
        ingredientId: ing ? ing.id : allIngredients[0].id, // fallback ingredient nếu lỗi mã
        lineNumber: i,
        receivedQuantity: new Prisma.Decimal(receivedQty),
        baseUnit: ing ? ing.baseUnit : 'PIECE',
        unitCostVnd: new Prisma.Decimal(unitCost),
        lineTotalVnd: lineTotal,
        note,
        validationErrors: errors.length > 0 ? errors.join('; ') : null,
      });
    }

    if (linesCreateData.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy dòng dữ liệu hợp lệ trong file CSV.',
      );
    }

    const receipt = await this.prisma.stockReceipt.create({
      data: {
        id: receiptId,
        storeId,
        receiptCode: this.generateReceiptCode(now),
        sourceType: dto.sourceType,
        sourceName: dto.sourceName.trim(),
        documentNo: dto.documentNo?.trim() ?? null,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
        status: 'DRAFT',
        totalCostVnd: totalCost,
        note: dto.note?.trim() ?? null,
        createdByUserId: BigInt(principal.userId),
        lines: {
          create: linesCreateData,
        },
      },
      include: {
        store: true,
        createdByUser: true,
        reviewedByUser: true,
        postedByUser: true,
        lines: { include: { ingredient: true } },
      },
    });

    return this.formatReceiptResponse(receipt);
  }

  async getReceiptsByStore(
    principal: WebManagerPrincipal,
    storeId: bigint,
    query: QueryStockReceiptsDto,
  ): Promise<PaginatedStockReceiptsResponseDto> {
    this.checkStoreScope(principal, storeId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.StockReceiptWhereInput = {
      storeId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.sourceType) {
      where.sourceType = query.sourceType;
    }
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }

    const [total, items] = await Promise.all([
      this.prisma.stockReceipt.count({ where }),
      this.prisma.stockReceipt.findMany({
        where,
        include: {
          createdByUser: true,
          postedByUser: true,
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const formattedItems: StockReceiptListItemDto[] = items.map((r) => ({
      id: r.id,
      storeId: r.storeId.toString(),
      receiptCode: r.receiptCode,
      sourceType: r.sourceType,
      sourceName: r.sourceName,
      documentNo: r.documentNo ?? null,
      documentDate: r.documentDate ? r.documentDate.toISOString() : null,
      status: r.status,
      totalCostVnd: r.totalCostVnd.toString(),
      lineCount: r._count.lines,
      createdByName: r.createdByUser.fullName,
      postedByName: r.postedByUser?.fullName ?? null,
      postedAt: r.postedAt ? r.postedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items: formattedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getReceiptById(
    principal: WebManagerPrincipal,
    receiptId: string,
  ): Promise<StockReceiptResponseDto> {
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: { id: receiptId },
      include: {
        store: true,
        createdByUser: true,
        reviewedByUser: true,
        postedByUser: true,
        lines: {
          include: { ingredient: true },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Phiếu nhập kho ${receiptId} không tồn tại.`);
    }

    this.checkStoreScope(principal, receipt.storeId);

    return this.formatReceiptResponse(receipt);
  }

  async updateReceipt(
    principal: WebManagerPrincipal,
    receiptId: string,
    dto: UpdateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: { id: receiptId },
      include: { lines: true },
    });

    if (!receipt) {
      throw new NotFoundException(`Phiếu nhập kho ${receiptId} không tồn tại.`);
    }

    this.checkStoreScope(principal, receipt.storeId);

    if (receipt.status === 'POSTED' || receipt.status === 'REJECTED') {
      throw new BadRequestException(
        `Phiếu đang ở trạng thái [${receipt.status}] là bất biến, không thể chỉnh sửa.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let totalCost = receipt.totalCostVnd;

      if (dto.lines && dto.lines.length > 0) {
        // Xóa lines cũ và tạo lines mới
        await tx.stockReceiptLine.deleteMany({ where: { receiptId } });

        const ingredientIds = dto.lines.map((l) => BigInt(l.ingredientId));
        const ingredients = await tx.ingredient.findMany({
          where: { id: { in: ingredientIds } },
        });
        const ingMap = new Map(ingredients.map((i) => [i.id.toString(), i]));

        totalCost = 0n;
        const newLines = dto.lines.map((line, index) => {
          const ing = ingMap.get(line.ingredientId);
          if (!ing) {
            throw new BadRequestException(
              `Nguyên liệu ID ${line.ingredientId} không tồn tại trong danh mục.`,
            );
          }
          const qtyDecimal = new Prisma.Decimal(line.receivedQuantity);
          const unitCostDecimal = new Prisma.Decimal(line.unitCostVnd);
          const lineTotal = BigInt(
            Math.round(line.receivedQuantity * line.unitCostVnd),
          );
          totalCost += lineTotal;

          return {
            id: randomUUID(),
            receiptId,
            ingredientId: ing.id,
            lineNumber: index + 1,
            receivedQuantity: qtyDecimal,
            baseUnit: ing.baseUnit,
            unitCostVnd: unitCostDecimal,
            lineTotalVnd: lineTotal,
            note: line.note ?? null,
          };
        });

        await tx.stockReceiptLine.createMany({ data: newLines });
      }

      const updated = await tx.stockReceipt.update({
        where: { id: receiptId },
        data: {
          sourceType: dto.sourceType ?? receipt.sourceType,
          sourceName: dto.sourceName
            ? dto.sourceName.trim()
            : receipt.sourceName,
          documentNo:
            dto.documentNo !== undefined
              ? (dto.documentNo?.trim() ?? null)
              : receipt.documentNo,
          documentDate:
            dto.documentDate !== undefined
              ? dto.documentDate
                ? new Date(dto.documentDate)
                : null
              : receipt.documentDate,
          note:
            dto.note !== undefined ? (dto.note?.trim() ?? null) : receipt.note,
          totalCostVnd: totalCost,
          status: 'REVIEWED',
          reviewedByUserId: BigInt(principal.userId),
        },
        include: {
          store: true,
          createdByUser: true,
          reviewedByUser: true,
          postedByUser: true,
          lines: {
            include: { ingredient: true },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      return this.formatReceiptResponse(updated);
    });
  }

  async postReceiptToStock(
    principal: WebManagerPrincipal,
    receiptId: string,
    idempotencyKey?: string,
  ): Promise<StockReceiptResponseDto> {
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: { id: receiptId },
      include: {
        lines: { include: { ingredient: true } },
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Phiếu nhập kho ${receiptId} không tồn tại.`);
    }

    this.checkStoreScope(principal, receipt.storeId);

    // Kiểm tra idempotency nếu đã POSTED
    if (receipt.status === 'POSTED') {
      if (idempotencyKey && receipt.idempotencyKey === idempotencyKey) {
        return this.getReceiptById(principal, receiptId);
      }
      throw new BadRequestException(
        'Phiếu nhập kho này đã được đăng kho trước đó.',
      );
    }

    if (receipt.status === 'REJECTED') {
      throw new BadRequestException(
        'Phiếu nhập kho này đã bị từ chối, không thể đăng kho.',
      );
    }

    if (!receipt.lines || receipt.lines.length === 0) {
      throw new BadRequestException(
        'Phiếu nhập không có dòng nguyên liệu nào để đăng kho.',
      );
    }

    // Kiểm tra lỗi dữ liệu dòng
    const invalidLine = receipt.lines.find((l) => l.validationErrors);
    if (invalidLine) {
      throw new BadRequestException(
        `Dòng ${invalidLine.lineNumber} còn lỗi xác thực: [${invalidLine.validationErrors}]. Vui lòng chỉnh sửa trước khi đăng kho.`,
      );
    }

    // Kiểm tra ràng buộc thiết bị POS Online & Sạch Outbox
    const activeDevice = await this.prisma.device.findFirst({
      where: { storeId: receipt.storeId, status: 'ACTIVE' },
    });
    if (!activeDevice) {
      throw new BadRequestException(
        'Chi nhánh chưa có thiết bị POS đang hoạt động (ACTIVE). Không thể đăng kho.',
      );
    }

    const nowMs = Date.now();
    const lastHeartbeatMs = activeDevice.lastHeartbeatAt
      ? activeDevice.lastHeartbeatAt.getTime()
      : 0;
    if (nowMs - lastHeartbeatMs > 90_000) {
      throw new BadRequestException(
        'Không thể đăng kho khi máy POS của chi nhánh đang offline (heartbeat quá 90 giây). Vui lòng đợi POS online và đồng bộ.',
      );
    }

    if (!activeDevice.lastSyncedAt) {
      throw new BadRequestException(
        'Thiết bị POS chi nhánh chưa hoàn tất đồng bộ với máy chủ. Vui lòng đợi POS đồng bộ.',
      );
    }

    if (
      activeDevice.hasPendingOutbox ||
      (activeDevice.outboxPendingCount ?? 0) > 0
    ) {
      throw new BadRequestException(
        'Thiết bị POS chi nhánh còn tác vụ chưa đồng bộ lên server. Vui lòng đợi POS đẩy hết Outbox.',
      );
    }

    // Thực thi transaction nguyên tử
    return this.prisma.$transaction(async (tx) => {
      await lockStoreCheckout(tx, receipt.storeId);
      await assertNoPendingOnlinePayment(tx, receipt.storeId);
      const now = new Date();
      const actorUserId = BigInt(principal.userId);

      // Sắp xếp ingredientId tăng dần để khóa hàng theo thứ tự (Chống Deadlock)
      const sortedLines = [...receipt.lines].sort((a, b) => {
        const idA = a.ingredientId;
        const idB = b.ingredientId;
        return idA < idB ? -1 : idA > idB ? 1 : 0;
      });

      for (const line of sortedLines) {
        // 1. Tăng số dư tồn kho
        const existingBalance = await tx.stockBalance.findUnique({
          where: {
            storeId_ingredientId: {
              storeId: receipt.storeId,
              ingredientId: line.ingredientId,
            },
          },
        });

        const currentQty = existingBalance
          ? existingBalance.quantity
          : new Prisma.Decimal(0);
        const newQty = currentQty.add(line.receivedQuantity);

        let balance;
        if (!existingBalance) {
          balance = await tx.stockBalance.create({
            data: {
              storeId: receipt.storeId,
              ingredientId: line.ingredientId,
              quantity: newQty,
              version: 1n,
            },
          });
        } else {
          balance = await tx.stockBalance.update({
            where: {
              storeId_ingredientId: {
                storeId: receipt.storeId,
                ingredientId: line.ingredientId,
              },
            },
            data: {
              quantity: newQty,
              version: { increment: 1n },
            },
          });
        }

        // 2. Ghi biến động bất biến vào stock_movements
        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            storeId: receipt.storeId,
            ingredientId: line.ingredientId,
            movementType: 'RECEIPT',
            quantityDelta: line.receivedQuantity,
            balanceAfter: balance.quantity,
            performedByUserId: actorUserId,
            receiptLineId: line.id,
            reason: `Nhập kho theo phiếu ${receipt.receiptCode} (${receipt.sourceName})`,
            occurredAt: now,
          },
        });

        // 3. Tạo biến động sync_changes để máy POS kéo delta
        await tx.syncChange.create({
          data: {
            storeId: receipt.storeId,
            entityType: 'stock_balances',
            entityId: line.ingredientId.toString(),
            changeType: 'UPSERT',
            payload: {
              storeId: receipt.storeId.toString(),
              ingredientId: line.ingredientId.toString(),
              quantity: balance.quantity.toString(),
              updatedAt: now.toISOString(),
            },
            changedAt: now,
          },
        });
      }

      // 4. Chuyển trạng thái phiếu sang POSTED
      const updatedReceipt = await tx.stockReceipt.update({
        where: { id: receiptId },
        data: {
          status: 'POSTED',
          postedByUserId: actorUserId,
          postedAt: now,
          idempotencyKey: idempotencyKey ?? null,
        },
        include: {
          store: true,
          createdByUser: true,
          reviewedByUser: true,
          postedByUser: true,
          lines: {
            include: { ingredient: true },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      // 5. Ghi nhật ký kiểm toán AuditLog
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId,
          storeId: receipt.storeId,
          action: 'STOCK_RECEIPT_POSTED',
          entityType: 'stock_receipts',
          entityId: receipt.id,
          metadata: {
            receiptCode: receipt.receiptCode,
            totalCostVnd: receipt.totalCostVnd.toString(),
            lineCount: receipt.lines.length,
          },
        },
      });

      return this.formatReceiptResponse(updatedReceipt);
    });
  }

  async rejectReceipt(
    principal: WebManagerPrincipal,
    receiptId: string,
    dto: RejectStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      throw new NotFoundException(`Phiếu nhập kho ${receiptId} không tồn tại.`);
    }

    this.checkStoreScope(principal, receipt.storeId);

    if (receipt.status === 'POSTED') {
      throw new BadRequestException(
        'Phiếu đã đăng kho chính thức, không thể từ chối/hủy bỏ.',
      );
    }

    const updated = await this.prisma.stockReceipt.update({
      where: { id: receiptId },
      data: {
        status: 'REJECTED',
        rejectionReason: dto.reason.trim(),
        reviewedByUserId: BigInt(principal.userId),
      },
      include: {
        store: true,
        createdByUser: true,
        reviewedByUser: true,
        postedByUser: true,
        lines: {
          include: { ingredient: true },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorUserId: BigInt(principal.userId),
        storeId: receipt.storeId,
        action: 'STOCK_RECEIPT_REJECTED',
        entityType: 'stock_receipts',
        entityId: receipt.id,
        metadata: {
          receiptCode: receipt.receiptCode,
          reason: dto.reason.trim(),
        },
      },
    });

    return this.formatReceiptResponse(updated);
  }
}
