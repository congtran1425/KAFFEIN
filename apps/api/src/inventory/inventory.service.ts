import {
  lockStoreCheckout,
  assertNoPendingOnlinePayment,
} from '../common/payment-store-lock';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateStockAdjustmentDto,
  IngredientResponseDto,
  RecipeVersionResponseDto,
  StockBalanceResponseDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getIngredients(): Promise<IngredientResponseDto[]> {
    const list = await this.prisma.ingredient.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });

    return list.map((item) => ({
      id: item.id.toString(),
      code: item.code,
      name: item.name,
      baseUnit: item.baseUnit,
      isActive: item.isActive,
    }));
  }

  async getActiveRecipes(): Promise<RecipeVersionResponseDto[]> {
    const recipes = await this.prisma.recipeVersion.findMany({
      where: { status: 'ACTIVE' },
      include: {
        items: {
          include: { ingredient: true },
        },
      },
      orderBy: { productVariantId: 'asc' },
    });

    return recipes.map((r) => ({
      id: r.id.toString(),
      productVariantId: r.productVariantId.toString(),
      versionNo: r.versionNo,
      status: r.status,
      items: r.items.map((i) => ({
        ingredientId: i.ingredientId.toString(),
        ingredientCode: i.ingredient.code,
        ingredientName: i.ingredient.name,
        baseUnit: i.ingredient.baseUnit,
        quantity: Number(i.quantity),
      })),
    }));
  }

  async getStockBalances(storeId: bigint): Promise<StockBalanceResponseDto[]> {
    const balances = await this.prisma.stockBalance.findMany({
      where: { storeId },
      include: { ingredient: true },
      orderBy: { ingredientId: 'asc' },
    });

    return balances.map((b) => ({
      storeId: b.storeId.toString(),
      ingredientId: b.ingredientId.toString(),
      ingredientCode: b.ingredient.code,
      ingredientName: b.ingredient.name,
      baseUnit: b.ingredient.baseUnit,
      quantity: Number(b.quantity),
      updatedAt: b.updatedAt.toISOString(),
    }));
  }

  async adjustStock(
    storeId: bigint,
    dto: CreateStockAdjustmentDto,
    actorUserId?: bigint,
  ): Promise<StockBalanceResponseDto[]> {
    return this.prisma.$transaction(async (tx) => {
      return this.adjustStockInsideTx(tx, storeId, dto, actorUserId);
    });
  }

  async adjustStockInsideTx(
    tx: Prisma.TransactionClient,
    storeId: bigint,
    dto: CreateStockAdjustmentDto,
    actorUserId?: bigint,
  ): Promise<StockBalanceResponseDto[]> {
    await lockStoreCheckout(tx, storeId);
    await assertNoPendingOnlinePayment(tx, storeId);
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException(`Chi nhánh ${storeId} không tồn tại.`);
    }

    // Kiểm tra trạng thái máy POS của chi nhánh:
    // Theo docs/01 và docs/04: Web chỉ cho phép điều chỉnh/nhập kho khi POS chi nhánh có thiết bị ACTIVE,
    // thiết bị đang online (heartbeat trong vòng 90 giây) và outbox của thiết bị đã được đồng bộ sạch lên server
    // (nhằm tránh phân kỳ tồn kho với POS đang offline hoặc POS còn tồn đọng tác vụ outbox chưa đẩy lên).
    const activeDevice = await tx.device.findFirst({
      where: { storeId, status: 'ACTIVE' },
    });
    if (!activeDevice) {
      throw new BadRequestException(
        'Chi nhánh chưa có thiết bị POS đang hoạt động (ACTIVE). Không thể điều chỉnh kho.',
      );
    }

    const nowMs = Date.now();
    const lastHeartbeatMs = activeDevice.lastHeartbeatAt
      ? activeDevice.lastHeartbeatAt.getTime()
      : 0;
    const isOnline = nowMs - lastHeartbeatMs <= 90_000;
    if (!isOnline) {
      throw new BadRequestException(
        'Không thể điều chỉnh kho khi máy POS của chi nhánh đang offline (heartbeat quá 90 giây). Vui lòng đợi POS online và đồng bộ.',
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

    // Sắp xếp ingredientId tăng dần để chống Deadlock
    const sortedItems = [...dto.items].sort((a, b) => {
      const idA = BigInt(a.ingredientId);
      const idB = BigInt(b.ingredientId);
      return idA < idB ? -1 : idA > idB ? 1 : 0;
    });

    const now = new Date();

    for (const item of sortedItems) {
      const ingredientId = BigInt(item.ingredientId);
      const ingredient = await tx.ingredient.findUnique({
        where: { id: ingredientId },
      });
      if (!ingredient) {
        throw new NotFoundException(
          `Nguyên liệu id=${item.ingredientId} không tồn tại.`,
        );
      }

      // Tìm hoặc khởi tạo số dư hiện tại
      let currentBalance = await tx.stockBalance.findUnique({
        where: { storeId_ingredientId: { storeId, ingredientId } },
      });

      const currentQty = currentBalance ? Number(currentBalance.quantity) : 0;
      const newQty = currentQty + item.quantityDelta;

      if (newQty < 0) {
        throw new BadRequestException(
          `Tồn kho nguyên liệu [${ingredient.name}] không đủ để xuất kho (Hiện có: ${currentQty}, yêu cầu trừ: ${Math.abs(item.quantityDelta)}).`,
        );
      }

      const deltaDecimal = new Prisma.Decimal(item.quantityDelta);
      const newQtyDecimal = new Prisma.Decimal(newQty);

      if (!currentBalance) {
        currentBalance = await tx.stockBalance.create({
          data: {
            storeId,
            ingredientId,
            quantity: newQtyDecimal,
            version: 1n,
          },
        });
      } else {
        currentBalance = await tx.stockBalance.update({
          where: { storeId_ingredientId: { storeId, ingredientId } },
          data: {
            quantity: newQtyDecimal,
            version: { increment: 1n },
          },
        });
      }

      // Ghi lại biến động kho bất biến (Append-only movement)
      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          storeId,
          ingredientId,
          movementType: dto.movementType,
          quantityDelta: deltaDecimal,
          balanceAfter: newQtyDecimal,
          performedByUserId: actorUserId ?? null,
          reason: dto.reason ?? null,
          occurredAt: now,
        },
      });

      // Ghi nhận vào sync_changes để POS pull delta tồn kho mới nhất
      await tx.syncChange.create({
        data: {
          storeId,
          entityType: 'stock_balances',
          entityId: ingredientId.toString(),
          changeType: 'UPSERT',
          payload: {
            storeId: storeId.toString(),
            ingredientId: ingredientId.toString(),
            quantity: newQtyDecimal.toString(),
            updatedAt: now.toISOString(),
          },
          changedAt: now,
        },
      });
    }

    // Trả về số dư mới sau khi điều chỉnh
    const updatedBalances = await tx.stockBalance.findMany({
      where: { storeId },
      include: { ingredient: true },
      orderBy: { ingredientId: 'asc' },
    });

    return updatedBalances.map((b) => ({
      storeId: b.storeId.toString(),
      ingredientId: b.ingredientId.toString(),
      ingredientCode: b.ingredient.code,
      ingredientName: b.ingredient.name,
      baseUnit: b.ingredient.baseUnit,
      quantity: Number(b.quantity),
      updatedAt: b.updatedAt.toISOString(),
    }));
  }
}
