import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CryptoUtil } from '../common/security/crypto.util';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { RegisterSessionsService } from '../register-sessions/register-sessions.service';
import { SalesService } from '../sales/sales.service';
import {
  SyncChangeItemDto,
  SyncPullQueryDto,
  SyncPullResponseDto,
  SyncPushRequestDto,
  SyncPushResponseDto,
  SyncPushResultItemDto,
} from './dto/sync.dto';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly inventoryService: InventoryService,
    private readonly registerSessionsService: RegisterSessionsService,
  ) {}

  /**
   * Xử lý Batch Outbox Operations từ POS đẩy lên với cơ chế Idempotency tuyệt đối
   */
  async pushOperations(
    storeId: bigint,
    deviceId: string,
    dto: SyncPushRequestDto,
  ): Promise<SyncPushResponseDto> {
    const processed: SyncPushResultItemDto[] = [];
    const errors: SyncPushResultItemDto[] = [];

    for (const op of dto.operations) {
      const opType = op.type || op.operationType;
      if (!opType) {
        errors.push({
          operationId: op.operationId,
          status: 'REJECTED',
          error: 'Thiếu trường type hoặc operationType trong tác vụ.',
        });
        continue;
      }

      const payloadString = JSON.stringify(op.payload);
      const payloadHash = CryptoUtil.sha256(payloadString);

      try {
        // Thực thi toàn bộ kiểm tra Idempotency, nghiệp vụ, và lưu sync_operations trong CÙNG 1 Transaction!
        const stepResult = await this.prisma.$transaction(async (tx) => {
          // 1. Kiểm tra Idempotency
          const existing = await tx.syncOperation.findUnique({
            where: { operationId: op.operationId },
          });

          if (existing) {
            // Kiểm tra xung đột thiết bị: Không được phép sử dụng cùng operationId từ hai thiết bị khác nhau!
            if (existing.deviceId && existing.deviceId !== deviceId) {
              throw new ConflictException(
                '409 OPERATION_DEVICE_COLLISION: operationId đã được sử dụng bởi một thiết bị khác.',
              );
            }
            if (existing.payloadHash !== payloadHash) {
              throw new ConflictException(
                '409 OPERATION_PAYLOAD_MISMATCH: Payload không khớp với operationId đã lưu trên hệ thống.',
              );
            }
            return {
              status: 'ALREADY_PROCESSED' as const,
              result: existing.result,
            };
          }

          // 2. Thực thi nghiệp vụ tương ứng theo operationType bằng transaction client
          let opResult: any;

          switch (opType) {
            case 'CASH_SALE_COMPLETED':
              opResult = await this.salesService.completeSaleInsideTx(
                tx,
                storeId,
                deviceId,
                op.payload as any,
                op.operationId,
              );
              break;

            case 'REGISTER_SESSION_OPENED':
              opResult = await this.registerSessionsService.openSessionInsideTx(
                tx,
                storeId,
                deviceId,
                op.payload as any,
              );
              break;

            case 'REGISTER_SESSION_CLOSED':
              opResult =
                await this.registerSessionsService.closeSessionInsideTx(
                  tx,
                  storeId,
                  deviceId,
                  op.payload.sessionId || op.payload.id,
                  op.payload as any,
                );
              break;

            case 'STOCK_ADJUSTED':
              throw new ForbiddenException(
                'Thiết bị POS không có quyền thực hiện tác vụ điều chỉnh kho (STOCK_ADJUSTED). Thao tác này chỉ dành cho tài khoản quản lý Web.',
              );

            default:
              throw new BadRequestException(
                `Loại tác vụ '${opType}' không được hỗ trợ.`,
              );
          }

          // 3. Ghi nhận thành công vào sync_operations TRONG CÙNG TRANSACTION
          await tx.syncOperation.create({
            data: {
              operationId: op.operationId,
              deviceId,
              storeId,
              operationType: opType,
              payloadHash,
              status: 'COMPLETED',
              result: opResult,
              completedAt: new Date(),
            },
          });

          return {
            status: 'COMPLETED' as const,
            result: opResult,
          };
        });

        processed.push({
          operationId: op.operationId,
          status: stepResult.status,
          result: stepResult.result,
        });
      } catch (err: unknown) {
        // Kiểm tra xem có phải tác vụ đã được xử lý bởi một transaction đồng thời song song không
        try {
          const doubleCheck = await this.prisma.syncOperation.findUnique({
            where: { operationId: op.operationId },
          });
          if (
            doubleCheck &&
            doubleCheck.deviceId === deviceId &&
            doubleCheck.payloadHash === payloadHash
          ) {
            processed.push({
              operationId: op.operationId,
              status: 'ALREADY_PROCESSED',
              result: doubleCheck.result,
            });
            continue;
          }
        } catch {
          // Bỏ qua lỗi double check nếu có
        }

        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Lỗi không xác định khi thực thi tác vụ';
        this.logger.error(
          `Error processing sync operation ${op.operationId} (${opType}): ${errorMsg}`,
        );
        errors.push({
          operationId: op.operationId,
          status: 'REJECTED',
          error: errorMsg,
        });
      }
    }

    // Only the device heartbeat knows the WHOLE local queue. An accepted batch
    // does not prove that later operations (or rejected local records) are gone.
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSyncedAt: new Date(),
      },
    });

    return { processed, errors };
  }

  /**
   * Kéo thay đổi từ Server về POS (Cursor-based sync)
   */
  async pullChanges(
    storeId: bigint,
    deviceId: string,
    query: SyncPullQueryDto,
  ): Promise<SyncPullResponseDto> {
    const rawCursor = query.cursor ?? '0';
    if (
      !/^\d{1,19}$/.test(rawCursor) ||
      BigInt(rawCursor) > 9223372036854775807n
    ) {
      throw new BadRequestException('Invalid sync cursor.');
    }
    const clientCursor = BigInt(rawCursor);
    const limit = Math.min(query.limit || 100, 500);
    const now = new Date();

    // TH1: Initial Cold Sync (cursor === 0)
    // Cung cấp snapshot toàn bộ danh mục, công thức, và danh sách nhân sự tại chi nhánh
    if (clientCursor === 0n) {
      // Cursor and all snapshot entities must see the same committed database
      // version. No network work is performed inside this short transaction.
      return this.prisma.$transaction(
        async (tx) => {
          const changes: SyncChangeItemDto[] = [];
          // Lấy baseline cursor hiện tại từ bảng sync_changes
          const lastRecordedChange = await tx.syncChange.findFirst({
            orderBy: { cursor: 'desc' },
            select: { cursor: true },
          });
          const baselineCursor = lastRecordedChange
            ? lastRecordedChange.cursor
            : 0n;
          const baselineCursorStr = baselineCursor.toString();

          // 1. Cấu hình chi nhánh
          const store = await tx.store.findUniqueOrThrow({
            where: { id: storeId },
          });
          changes.push({
            cursor: baselineCursorStr,
            entityType: 'stores',
            entityId: store.id.toString(),
            changeType: 'UPSERT',
            payload: {
              id: store.id.toString(),
              code: store.code,
              name: store.name,
              address: store.address,
            },
            changedAt: now.toISOString(),
          });

          // 2. Danh mục sản phẩm & Thuế
          const categories = await tx.productCategory.findMany({
            orderBy: { sortOrder: 'asc' },
          });
          for (const cat of categories) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'product_categories',
              entityId: cat.id.toString(),
              changeType: 'UPSERT',
              payload: {
                id: cat.id.toString(),
                name: cat.name,
                sortOrder: cat.sortOrder,
                taxRateBps: cat.taxRateBps,
                isActive: cat.isActive,
              },
              changedAt: now.toISOString(),
            });
          }

          // 3. Sản phẩm và biến thể Size
          const products = await tx.product.findMany({
            include: {
              variants: true,
              allowedToppings: { include: { topping: true } },
            },
          });
          for (const p of products) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'products',
              entityId: p.id.toString(),
              changeType: 'UPSERT',
              payload: {
                id: p.id.toString(),
                categoryId: p.categoryId.toString(),
                code: p.code,
                name: p.name,
                description: p.description,
                isActive: p.isActive,
                variants: p.variants.map((v) => ({
                  id: v.id.toString(),
                  code: v.code,
                  sizeLabel: v.sizeLabel,
                  priceVnd: v.priceVnd.toString(),
                  isDefault: v.isDefault,
                  isActive: v.isActive,
                })),
                allowedToppingIds: p.allowedToppings.map((pt) =>
                  pt.toppingId.toString(),
                ),
              },
              changedAt: now.toISOString(),
            });
          }

          // 4. Danh mục Topping
          const toppings = await tx.topping.findMany({});
          for (const t of toppings) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'toppings',
              entityId: t.id.toString(),
              changeType: 'UPSERT',
              payload: {
                id: t.id.toString(),
                code: t.code,
                name: t.name,
                priceVnd: t.priceVnd.toString(),
                isActive: t.isActive,
              },
              changedAt: now.toISOString(),
            });
          }

          // 5. Danh sách nhân sự được phép đăng nhập (TUYỆT ĐỐI KHÔNG GỬI pinHash!)
          const employees = await tx.user.findMany({
            where: {
              homeStoreId: storeId,
              status: 'ACTIVE',
            },
            include: { pinCredential: true },
          });
          for (const emp of employees) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'employees',
              entityId: emp.id.toString(),
              changeType: 'UPSERT',
              payload: {
                id: emp.id.toString(),
                employeeCode: emp.employeeCode.toString(),
                fullName: emp.fullName,
                role: emp.role,
                pinVersion: emp.pinCredential?.pinVersion ?? 1,
                // Chú ý: TUYỆT ĐỐI KHÔNG trả pinHash để bảo vệ an toàn
              },
              changedAt: now.toISOString(),
            });
          }

          // 6. Danh mục Nguyên liệu (Ingredients)
          const ingredients =
            (await tx.ingredient?.findMany({
              where: { isActive: true },
              orderBy: { code: 'asc' },
            })) || [];
          for (const ing of ingredients) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'ingredients',
              entityId: ing.id.toString(),
              changeType: 'UPSERT',
              payload: {
                id: ing.id.toString(),
                code: ing.code,
                name: ing.name,
                baseUnit: ing.baseUnit,
                isActive: ing.isActive,
              },
              changedAt: now.toISOString(),
            });
          }

          // 7. Công thức pha chế (Recipes cho Biến thể món và Topping)
          const activeRecipes =
            (await tx.recipeVersion?.findMany({
              where: { status: 'ACTIVE' },
              include: {
                items: {
                  include: { ingredient: true },
                },
              },
              orderBy: { productVariantId: 'asc' },
            })) || [];
          for (const r of activeRecipes) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'recipes',
              entityId: r.id.toString(),
              changeType: 'UPSERT',
              payload: {
                id: r.id.toString(),
                productVariantId: r.productVariantId.toString(),
                versionNo: r.versionNo,
                status: r.status,
                items: r.items.map((i) => ({
                  ingredientId: i.ingredientId.toString(),
                  ingredientCode: i.ingredient.code,
                  quantity: i.quantity.toString(),
                })),
              },
              changedAt: now.toISOString(),
            });
          }

          const toppingItems =
            (await tx.toppingItem?.findMany({
              include: { ingredient: true },
            })) || [];
          const toppingRecipesMap = new Map<
            string,
            Array<{
              ingredientId: string;
              ingredientCode: string;
              quantity: string;
            }>
          >();
          for (const ti of toppingItems) {
            const topId = ti.toppingId.toString();
            if (!toppingRecipesMap.has(topId)) {
              toppingRecipesMap.set(topId, []);
            }
            toppingRecipesMap.get(topId)!.push({
              ingredientId: ti.ingredientId.toString(),
              ingredientCode: ti.ingredient.code,
              quantity: ti.quantity.toString(),
            });
          }
          for (const [topId, items] of toppingRecipesMap.entries()) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'topping_recipes',
              entityId: topId,
              changeType: 'UPSERT',
              payload: {
                toppingId: topId,
                items,
              },
              changedAt: now.toISOString(),
            });
          }

          // 8. Số dư tồn kho nguyên liệu tại chi nhánh (Store Stock Balances)
          const stockBalances =
            (await tx.stockBalance?.findMany({
              where: { storeId },
              include: { ingredient: true },
              orderBy: { ingredientId: 'asc' },
            })) || [];
          for (const sb of stockBalances) {
            changes.push({
              cursor: baselineCursorStr,
              entityType: 'stock_balances',
              entityId: sb.ingredientId.toString(),
              changeType: 'UPSERT',
              payload: {
                storeId: storeId.toString(),
                ingredientId: sb.ingredientId.toString(),
                quantity: sb.quantity.toString(),
                updatedAt: sb.updatedAt.toISOString(),
              },
              changedAt: now.toISOString(),
            });
          }

          const nextCursor = baselineCursorStr;

          // Lưu checkpoint
          await tx.deviceSyncCheckpoint.upsert({
            where: { deviceId },
            update: { lastCursor: baselineCursor },
            create: { deviceId, lastCursor: baselineCursor },
          });

          await tx.device.update({
            where: { id: deviceId },
            data: { lastSyncedAt: now },
          });

          return {
            changes,
            nextCursor,
            hasMore: false,
            serverTime: now.toISOString(),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    }

    // TH2: Delta Sync (cursor > 0)
    const dbChanges = await this.prisma.syncChange.findMany({
      where: {
        cursor: { gt: clientCursor },
        OR: [{ storeId: null }, { storeId }],
      },
      orderBy: { cursor: 'asc' },
      take: limit + 1,
    });

    const hasMore = dbChanges.length > limit;
    const resultList = hasMore ? dbChanges.slice(0, limit) : dbChanges;
    const nextCursor =
      resultList.length > 0
        ? resultList[resultList.length - 1].cursor.toString()
        : clientCursor.toString();

    // Cập nhật checkpoint và lastSyncedAt cho thiết bị
    if (resultList.length > 0) {
      await this.prisma.deviceSyncCheckpoint.upsert({
        where: { deviceId },
        update: { lastCursor: BigInt(nextCursor) },
        create: { deviceId, lastCursor: BigInt(nextCursor) },
      });
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSyncedAt: now },
    });

    return {
      changes: resultList.map((c) => ({
        cursor: c.cursor.toString(),
        entityType: c.entityType,
        entityId: c.entityId,
        changeType: c.changeType,
        payload: c.payload,
        changedAt: c.changedAt.toISOString(),
      })),
      nextCursor,
      hasMore,
      serverTime: now.toISOString(),
    };
  }

  /**
   * Ghi nhận một thay đổi kỹ thuật vào bảng sync_changes để các máy POS pull delta về
   */
  async recordChange(
    storeId: bigint | null,
    entityType: string,
    entityId: string,
    changeType: 'UPSERT' | 'DELETE',
    payload: any,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    return db.syncChange.create({
      data: {
        storeId,
        entityType,
        entityId,
        changeType,
        payload,
        changedAt: new Date(),
      },
    });
  }
}
