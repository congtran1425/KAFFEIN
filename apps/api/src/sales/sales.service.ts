import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SaleResponseDto } from './dto/sale-response.dto';
import {
  lockStoreCheckout,
  assertNoPendingOnlinePayment,
} from '../common/payment-store-lock';

interface NormalizedSaleInput {
  id: string;
  saleNumber?: string;
  cashierUserId?: string;
  cashierCode?: string;
  registerSessionId?: string;
  note?: string;
  createdAt?: string;
  paymentMethod: 'CASH' | 'ZALOPAY' | 'MOMO';
  amountVnd: bigint;
  subtotalVnd?: bigint;
  taxVnd?: bigint;
  totalVnd?: bigint;
  merchantOrderId?: string;
  items: Array<{
    id?: string;
    productId: bigint;
    productVariantId: bigint;
    recipeVersionId?: bigint;
    quantity: number;
    baseUnitPriceVnd?: bigint;
    unitPriceVnd?: bigint;
    lineTotalVnd?: bigint;
    taxRateBps?: number;
    taxAmountVnd?: bigint;
    subtotalVnd?: bigint;
    note?: string;
    toppings: Array<{
      toppingId: bigint;
      quantityPerItem: number;
      unitPriceVnd?: bigint;
    }>;
    consumptions?: Array<{
      ingredientId: bigint;
      ingredientNameSnapshot: string;
      unitSnapshot: string;
      quantityPerItem: number;
      quantityTotal: number;
    }>;
  }>;
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tính ngày kinh doanh theo múi giờ chuẩn của cửa hàng: Asia/Ho_Chi_Minh
   */
  getBusinessDate(date: Date = new Date()): Date {
    const vnDateString = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return new Date(`${vnDateString}T00:00:00.000Z`);
  }

  /**
   * Chuẩn hóa dữ liệu đầu vào: Chấp nhận cả DTO trực tiếp và Payload từ Android POS Outbox
   */
  async normalizeSaleInput(
    tx: Prisma.TransactionClient,
    raw: any,
  ): Promise<NormalizedSaleInput> {
    const saleId = raw.id || raw.saleId || randomUUID();
    const saleNumber = raw.saleNumber;
    const cashierUserId = raw.cashierUserId
      ? String(raw.cashierUserId)
      : undefined;
    const cashierCode = raw.cashierCode ? String(raw.cashierCode) : undefined;
    const registerSessionId = raw.registerSessionId
      ? String(raw.registerSessionId)
      : undefined;
    const note = raw.note;
    const createdAt =
      raw.createdAt ||
      (raw.completedAtEpochMs
        ? new Date(raw.completedAtEpochMs).toISOString()
        : undefined);

    const methodStr = (
      raw.payment?.method ||
      raw.paymentMethod ||
      'CASH'
    ).toUpperCase();
    const paymentMethod: 'CASH' | 'ZALOPAY' | 'MOMO' =
      methodStr === 'MOMO'
        ? 'MOMO'
        : methodStr === 'ZALOPAY'
          ? 'ZALOPAY'
          : 'CASH';

    const subtotalVnd =
      raw.subtotalVnd !== undefined ? BigInt(raw.subtotalVnd) : undefined;
    const taxVnd = raw.taxVnd !== undefined ? BigInt(raw.taxVnd) : undefined;
    const totalVnd =
      raw.totalVnd !== undefined ? BigInt(raw.totalVnd) : undefined;

    const amountVnd = BigInt(
      raw.payment?.amountVnd ?? raw.totalVnd ?? raw.subtotalVnd ?? 0,
    );
    const merchantOrderId = raw.payment?.merchantOrderId;

    const normalizedItems: NormalizedSaleInput['items'] = [];

    if (Array.isArray(raw.items)) {
      for (const item of raw.items) {
        let productId: bigint;
        let productVariantId: bigint;

        // Định dạng Android POS: { product: { id, code, ... }, size: "SIZE_M", ... }
        if (item.product && typeof item.product === 'object') {
          try {
            productId = BigInt(item.product.id);
          } catch {
            const rawId = String(item.product.id || item.product.code || '');
            let foundProduct = null;
            if (item.product.code) {
              foundProduct = await tx.product?.findUnique({
                where: { code: String(item.product.code) },
              });
            }
            if (!foundProduct) {
              foundProduct = await tx.product?.findUnique({
                where: { code: rawId },
              });
            }
            if (!foundProduct) {
              throw new NotFoundException(
                `Không tìm thấy sản phẩm '${rawId}' trên hệ thống.`,
              );
            }
            productId = foundProduct.id;
          }

          const sizeCode =
            item.size === 'SIZE_L' || item.size === 'L' ? 'L' : 'M';

          // Tìm variant tương ứng theo productId và code
          const variant = await tx.productVariant.findFirst({
            where: { productId, code: sizeCode },
          });

          if (!variant) {
            // Fallback lấy variant mặc định
            const defaultVariant = await tx.productVariant.findFirst({
              where: { productId },
              orderBy: { isDefault: 'desc' },
            });
            if (!defaultVariant) {
              throw new NotFoundException(
                `Không tìm thấy biến thể cho món id=${productId}`,
              );
            }
            productVariantId = defaultVariant.id;
          } else {
            productVariantId = variant.id;
          }
        } else {
          // Định dạng trực tiếp: { productId, productVariantId, ... }
          try {
            productId = BigInt(item.productId);
          } catch {
            const rawProdId = String(item.productId);
            const foundProduct = await tx.product?.findUnique({
              where: { code: rawProdId },
            });
            if (!foundProduct) {
              throw new NotFoundException(
                `Không tìm thấy sản phẩm '${rawProdId}' trên hệ thống.`,
              );
            }
            productId = foundProduct.id;
          }

          try {
            productVariantId = BigInt(item.productVariantId);
          } catch {
            const rawVarId = item.productVariantId
              ? String(item.productVariantId)
              : null;
            let foundVariant = null;
            if (rawVarId) {
              foundVariant = await tx.productVariant?.findFirst({
                where: { productId, code: rawVarId },
              });
            }
            if (!foundVariant) {
              foundVariant = await tx.productVariant?.findFirst({
                where: { productId },
                orderBy: { isDefault: 'desc' },
              });
            }
            if (!foundVariant) {
              throw new NotFoundException(
                `Không tìm thấy biến thể cho món id=${productId}`,
              );
            }
            productVariantId = foundVariant.id;
          }
        }

        const quantity = item.quantity ?? 1;
        const itemNote = item.note;

        // Chuẩn hóa toppings
        const itemToppings: Array<{
          toppingId: bigint;
          quantityPerItem: number;
          unitPriceVnd?: bigint;
        }> = [];
        if (Array.isArray(item.toppings)) {
          for (const t of item.toppings) {
            let toppingId: bigint;
            try {
              toppingId = BigInt(t.topping?.id ?? t.toppingId ?? t.id);
            } catch {
              const rawToppingId = String(
                t.topping?.id ?? t.toppingId ?? t.id ?? '',
              );
              let foundTopping = null;
              if (t.topping?.code || t.code) {
                foundTopping = await tx.topping?.findUnique({
                  where: { code: String(t.topping?.code || t.code) },
                });
              }
              if (!foundTopping) {
                foundTopping = await tx.topping?.findUnique({
                  where: { code: rawToppingId },
                });
              }
              if (!foundTopping) {
                throw new NotFoundException(
                  `Không tìm thấy topping '${rawToppingId}' trên hệ thống.`,
                );
              }
              toppingId = foundTopping.id;
            }
            const quantityPerItem = t.quantity ?? t.quantityPerItem ?? 1;
            const rawTopPrice =
              t.unitPriceVnd ?? t.priceVnd ?? t.price ?? t.unitPrice;
            const unitPriceVnd =
              rawTopPrice !== undefined ? BigInt(rawTopPrice) : undefined;
            itemToppings.push({ toppingId, quantityPerItem, unitPriceVnd });
          }
        }

        let recipeVersionId: bigint | undefined = undefined;
        const rawRecipeVersionId =
          item.recipeVersionId ??
          item.recipeVersion?.id ??
          item.recipe_version_id;
        if (rawRecipeVersionId) {
          try {
            recipeVersionId = BigInt(rawRecipeVersionId);
          } catch {
            // bỏ qua nếu parse thất bại
          }
        }

        const normalizedConsumptions: Array<{
          ingredientId: bigint;
          ingredientNameSnapshot: string;
          unitSnapshot: string;
          quantityPerItem: number;
          quantityTotal: number;
        }> = [];

        if (Array.isArray(item.consumptions)) {
          for (const c of item.consumptions) {
            let ingredientId: bigint | null = null;
            try {
              ingredientId = BigInt(c.ingredientId || c.ingredient?.id);
            } catch {
              const rawIngId = String(
                c.ingredientId || c.ingredientCode || c.code || '',
              );
              const foundIng = await tx.ingredient.findFirst({
                where: { OR: [{ code: rawIngId }, { name: rawIngId }] },
              });
              if (foundIng) ingredientId = foundIng.id;
            }
            if (!ingredientId) continue;
            const ingRecord = await tx.ingredient.findUnique({
              where: { id: ingredientId },
            });
            if (!ingRecord) continue;

            const qtyPerItem = Number(c.quantityPerItem ?? c.quantity ?? 1);
            const qtyTotal = Number(c.quantityTotal ?? qtyPerItem * quantity);

            normalizedConsumptions.push({
              ingredientId,
              ingredientNameSnapshot:
                c.ingredientNameSnapshot || c.ingredientName || ingRecord.name,
              unitSnapshot: c.unitSnapshot || c.unit || ingRecord.baseUnit,
              quantityPerItem: qtyPerItem,
              quantityTotal: qtyTotal,
            });
          }
        }

        const rawBasePrice =
          item.baseUnitPriceVnd ??
          item.unitPriceVnd ??
          item.priceVnd ??
          item.price ??
          item.variantPriceVnd;
        const baseUnitPriceVnd =
          rawBasePrice !== undefined ? BigInt(rawBasePrice) : undefined;

        const rawLineTotal = item.lineTotalVnd ?? item.totalVnd;
        const lineTotalVnd =
          rawLineTotal !== undefined ? BigInt(rawLineTotal) : undefined;

        const rawTaxRate = item.taxRateBps ?? item.taxRate;
        const taxRateBps =
          rawTaxRate !== undefined ? Number(rawTaxRate) : undefined;

        const rawTaxAmount = item.taxAmountVnd ?? item.taxVnd;
        const taxAmountVnd =
          rawTaxAmount !== undefined ? BigInt(rawTaxAmount) : undefined;

        const rawSubtotal = item.subtotalVnd;
        const itemSubtotalVnd =
          rawSubtotal !== undefined ? BigInt(rawSubtotal) : undefined;

        normalizedItems.push({
          id: item.id || item.lineId,
          productId,
          productVariantId,
          recipeVersionId,
          quantity,
          baseUnitPriceVnd,
          lineTotalVnd,
          taxRateBps,
          taxAmountVnd,
          subtotalVnd: itemSubtotalVnd,
          note: itemNote,
          toppings: itemToppings,
          consumptions:
            normalizedConsumptions.length > 0
              ? normalizedConsumptions
              : undefined,
        });
      }
    }

    return {
      id: saleId,
      saleNumber,
      cashierUserId,
      cashierCode,
      registerSessionId,
      note,
      createdAt,
      paymentMethod,
      amountVnd,
      subtotalVnd,
      taxVnd,
      totalVnd,
      merchantOrderId,
      items: normalizedItems,
    };
  }

  /**
   * Hoàn tất đơn hàng và trừ tồn kho nguyên tử trong 1 Transaction duy nhất
   */
  async completeSale(
    storeId: bigint,
    deviceId: string,
    rawPayload: any,
    sourceOperationId?: string,
  ): Promise<SaleResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      return this.completeSaleInsideTx(
        tx,
        storeId,
        deviceId,
        rawPayload,
        sourceOperationId,
      );
    });
  }

  /**
   * Thực thi toàn bộ đơn hàng bên trong một transaction có sẵn (dùng cho Sync Push Idempotency)
   */
  async completeSaleInsideTx(
    tx: Prisma.TransactionClient,
    storeId: bigint,
    deviceId: string,
    rawPayload: any,
    sourceOperationId?: string,
  ): Promise<SaleResponseDto> {
    const input = await this.normalizeSaleInput(tx, rawPayload);
    await lockStoreCheckout(tx, storeId);
    await assertNoPendingOnlinePayment(tx, storeId);
    const saleId = input.id;
    const now = input.createdAt ? new Date(input.createdAt) : new Date();
    const businessDate = this.getBusinessDate(now);

    // 1. Xác định nhân viên thu ngân:
    // Theo quy tắc nghiệp vụ: Nếu đơn hàng replay offline có snapshot cashierCode/cashierUserId,
    // ta ưu tiên sử dụng snapshot đó (sau khi xác thực nhân viên thuộc đúng chi nhánh và đang ACTIVE),
    // tránh gán sai người bán cho nhân viên đang mở ca lúc replay!
    const activeSession = await tx.cashierSession.findFirst({
      where: { deviceId, status: 'ACTIVE' },
      include: { user: true },
      orderBy: { startedAt: 'desc' },
    });

    let cashierUserId: bigint;
    if (input.cashierCode) {
      const user = await tx.user.findUnique({
        where: { employeeCode: BigInt(input.cashierCode) },
      });
      if (!user || user.status !== 'ACTIVE' || user.homeStoreId !== storeId) {
        throw new ForbiddenException(
          'Nhân viên thu ngân không hợp lệ, không hoạt động hoặc không thuộc chi nhánh này.',
        );
      }
      cashierUserId = user.id;
    } else if (input.cashierUserId) {
      const user = await tx.user.findUnique({
        where: { id: BigInt(input.cashierUserId) },
      });
      if (!user || user.status !== 'ACTIVE' || user.homeStoreId !== storeId) {
        throw new ForbiddenException(
          'Nhân viên thu ngân không hợp lệ, không hoạt động hoặc không thuộc chi nhánh này.',
        );
      }
      cashierUserId = user.id;
    } else if (activeSession) {
      cashierUserId = activeSession.userId;
    } else {
      throw new ForbiddenException(
        'Không có thông tin thu ngân và không có phiên thu ngân (Cashier Session) nào đang hoạt động trên thiết bị này.',
      );
    }

    // 2. Xác thực phiên tiền mặt (Register Session)
    if (input.registerSessionId) {
      const reg = await tx.registerSession.findUnique({
        where: { id: input.registerSessionId },
      });
      if (
        !reg ||
        reg.deviceId !== deviceId ||
        reg.storeId !== storeId ||
        reg.status !== 'OPEN'
      ) {
        throw new BadRequestException(
          'Phiên tiền mặt (register_session_id) không hợp lệ, không thuộc thiết bị/chi nhánh này hoặc đã đóng.',
        );
      }
    }

    // 3. Tải toàn bộ Variant, Product, Category, Topping, Recipe liên quan
    const variantIds = input.items.map((i) => i.productVariantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: {
          include: { category: true },
        },
        recipeVersions: {
          where: { status: 'ACTIVE' },
          include: {
            items: {
              include: { ingredient: true },
            },
          },
        },
      },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const allToppingIds: bigint[] = [];
    input.items.forEach((item) => {
      item.toppings.forEach((t) => allToppingIds.push(t.toppingId));
    });

    const toppings =
      allToppingIds.length > 0
        ? await tx.topping.findMany({
            where: { id: { in: allToppingIds } },
            include: {
              items: {
                include: { ingredient: true },
              },
            },
          })
        : [];
    const toppingMap = new Map(toppings.map((t) => [t.id, t]));

    // 4. Tính toán dòng món, thuế VAT inclusive, và định mức tiêu hao
    let totalSaleSubtotalVnd = 0n;
    let totalSaleTaxVnd = 0n;
    let totalSaleAmountVnd = 0n;

    interface ProcessedItem {
      saleItemId: string;
      productId: bigint;
      productVariantId: bigint;
      recipeVersionId: bigint | null;
      productNameSnapshot: string;
      variantNameSnapshot: string;
      baseUnitPriceVnd: bigint;
      quantity: number;
      taxRateBpsSnapshot: number;
      taxAmountVnd: bigint;
      subtotalVnd: bigint;
      lineTotalVnd: bigint;
      note?: string;
      toppings: Array<{
        id: string;
        toppingId: bigint;
        toppingNameSnapshot: string;
        unitPriceVndSnapshot: bigint;
        quantityPerItem: number;
      }>;
      consumptions: Array<{
        id: string;
        ingredientId: bigint;
        ingredientNameSnapshot: string;
        unitSnapshot: string;
        quantityPerItem: Prisma.Decimal;
        quantityTotal: Prisma.Decimal;
      }>;
    }

    const processedItems: ProcessedItem[] = [];
    const ingredientTotalDeductions = new Map<
      bigint,
      { name: string; quantity: number }
    >();

    for (const item of input.items) {
      const variant = variantMap.get(item.productVariantId);
      if (!variant) {
        throw new NotFoundException(
          `Biến thể món id=${item.productVariantId} không tồn tại.`,
        );
      }

      // Giá cơ sở: Ưu tiên snapshot từ POS offline, nếu không có mới lấy từ catalog hiện tại
      const baseUnitPriceVnd =
        item.baseUnitPriceVnd !== undefined
          ? item.baseUnitPriceVnd
          : variant.priceVnd;
      let itemToppingTotalVnd = 0n;

      const processedToppings: ProcessedItem['toppings'] = [];
      const itemConsumptionMap = new Map<
        bigint,
        { name: string; unit: string; qtyPerItem: number }
      >();

      // Xử lý toppings
      for (const tDto of item.toppings) {
        const topping = toppingMap.get(tDto.toppingId);
        if (!topping) {
          throw new NotFoundException(
            `Topping id=${tDto.toppingId} không tồn tại.`,
          );
        }
        const qtyPerItem = tDto.quantityPerItem ?? 1;
        const toppingPrice =
          tDto.unitPriceVnd !== undefined
            ? tDto.unitPriceVnd
            : topping.priceVnd;
        itemToppingTotalVnd += toppingPrice * BigInt(qtyPerItem);

        processedToppings.push({
          id: randomUUID(),
          toppingId: topping.id,
          toppingNameSnapshot: topping.name,
          unitPriceVndSnapshot: toppingPrice,
          quantityPerItem: qtyPerItem,
        });

        // Tiêu hao từ topping
        for (const ti of topping.items) {
          const ingQty = Number(ti.quantity) * qtyPerItem;
          const existing = itemConsumptionMap.get(ti.ingredientId);
          if (existing) {
            existing.qtyPerItem += ingQty;
          } else {
            itemConsumptionMap.set(ti.ingredientId, {
              name: ti.ingredient.name,
              unit: ti.ingredient.baseUnit,
              qtyPerItem: ingQty,
            });
          }
        }
      }

      // Tiêu hao từ công thức chính của món:
      // Tuân thủ docs/05: Backend không tính lại sale cũ bằng recipe hiện tại.
      // Nếu POS offline bán theo recipe version cũ (gửi kèm recipeVersionId), backend nhận và áp dụng đúng recipe version đó.
      let appliedRecipe = variant.recipeVersions[0];
      if (item.recipeVersionId) {
        const specificRecipe = await tx.recipeVersion.findUnique({
          where: { id: item.recipeVersionId },
          include: {
            items: {
              include: { ingredient: true },
            },
          },
        });
        if (specificRecipe) {
          appliedRecipe = specificRecipe;
        }
      }

      if (appliedRecipe) {
        for (const ri of appliedRecipe.items) {
          const ingQty = Number(ri.quantity);
          const existing = itemConsumptionMap.get(ri.ingredientId);
          if (existing) {
            existing.qtyPerItem += ingQty;
          } else {
            itemConsumptionMap.set(ri.ingredientId, {
              name: ri.ingredient.name,
              unit: ri.ingredient.baseUnit,
              qtyPerItem: ingQty,
            });
          }
        }
      }

      // Tính tiền món inclusive VAT
      const unitGrossPriceVnd =
        item.unitPriceVnd !== undefined
          ? item.unitPriceVnd
          : baseUnitPriceVnd + itemToppingTotalVnd;
      const lineTotalVnd =
        item.lineTotalVnd !== undefined
          ? item.lineTotalVnd
          : unitGrossPriceVnd * BigInt(item.quantity);
      const taxRateBps =
        item.taxRateBps !== undefined
          ? item.taxRateBps
          : (variant.product.category.taxRateBps ?? 0);

      // Công thức Inclusive VAT: subtotal = lineTotal * 10000 / (10000 + taxRateBps)
      let lineSubtotalVnd: bigint;
      let lineTaxVnd: bigint;
      if (item.subtotalVnd !== undefined && item.taxAmountVnd !== undefined) {
        lineSubtotalVnd = item.subtotalVnd;
        lineTaxVnd = item.taxAmountVnd;
      } else {
        lineSubtotalVnd = (lineTotalVnd * 10000n) / BigInt(10000 + taxRateBps);
        lineTaxVnd = lineTotalVnd - lineSubtotalVnd;
      }

      totalSaleAmountVnd += lineTotalVnd;
      totalSaleTaxVnd += lineTaxVnd;
      totalSaleSubtotalVnd += lineSubtotalVnd;

      let saleItemId = item.id ?? randomUUID();
      if (item.id) {
        const existingSaleItem = await tx.saleItem.findUnique({
          where: { id: item.id },
        });
        if (existingSaleItem) {
          saleItemId = randomUUID();
        }
      }
      const processedConsumptions: ProcessedItem['consumptions'] = [];

      if (item.consumptions && item.consumptions.length > 0) {
        // POS đã tính toán và gửi trực tiếp snapshot tiêu hao nguyên liệu (docs/05)
        // Kiểm tra số lượng dương, khớp tổng dòng hàng, và sự phù hợp với recipe/topping
        const seenIngredients = new Set<bigint>();

        for (const c of item.consumptions) {
          if (c.quantityPerItem <= 0 || c.quantityTotal <= 0) {
            throw new BadRequestException(
              `Số lượng tiêu hao nguyên liệu id=${c.ingredientId} phải lớn hơn 0.`,
            );
          }

          const expectedTotal = c.quantityPerItem * item.quantity;
          if (Math.abs(c.quantityTotal - expectedTotal) > 0.001) {
            throw new BadRequestException(
              `Tổng lượng tiêu hao của nguyên liệu id=${c.ingredientId} không khớp với số lượng món (${c.quantityTotal} vs ${expectedTotal}).`,
            );
          }

          const expectedRecipe = itemConsumptionMap.get(c.ingredientId);
          if (!expectedRecipe) {
            throw new BadRequestException(
              `Nguyên liệu id=${c.ingredientId} (${c.ingredientNameSnapshot}) không thuộc công thức món hoặc topping hợp lệ.`,
            );
          }

          if (Math.abs(c.quantityPerItem - expectedRecipe.qtyPerItem) > 0.001) {
            throw new BadRequestException(
              `Định mức tiêu hao nguyên liệu id=${c.ingredientId} (${c.quantityPerItem}) không khớp với công thức/topping (${expectedRecipe.qtyPerItem}).`,
            );
          }

          seenIngredients.add(c.ingredientId);

          processedConsumptions.push({
            id: randomUUID(),
            ingredientId: c.ingredientId,
            ingredientNameSnapshot:
              c.ingredientNameSnapshot || expectedRecipe.name,
            unitSnapshot: c.unitSnapshot || expectedRecipe.unit,
            quantityPerItem: new Prisma.Decimal(c.quantityPerItem),
            quantityTotal: new Prisma.Decimal(c.quantityTotal),
          });

          const totalEntry = ingredientTotalDeductions.get(c.ingredientId);
          if (totalEntry) {
            totalEntry.quantity += c.quantityTotal;
          } else {
            ingredientTotalDeductions.set(c.ingredientId, {
              name: c.ingredientNameSnapshot || expectedRecipe.name,
              quantity: c.quantityTotal,
            });
          }
        }

        // Kiểm tra tính đầy đủ: Tất cả nguyên liệu bắt buộc phải có trong consumptions
        for (const [requiredIngId, reqData] of itemConsumptionMap.entries()) {
          if (!seenIngredients.has(requiredIngId)) {
            throw new BadRequestException(
              `Thiếu nguyên liệu id=${requiredIngId} (${reqData.name}) trong danh sách tiêu hao gửi lên từ POS.`,
            );
          }
        }
      } else {
        for (const [ingId, cData] of itemConsumptionMap.entries()) {
          const qtyTotal = cData.qtyPerItem * item.quantity;
          processedConsumptions.push({
            id: randomUUID(),
            ingredientId: ingId,
            ingredientNameSnapshot: cData.name,
            unitSnapshot: cData.unit,
            quantityPerItem: new Prisma.Decimal(cData.qtyPerItem),
            quantityTotal: new Prisma.Decimal(qtyTotal),
          });

          const totalEntry = ingredientTotalDeductions.get(ingId);
          if (totalEntry) {
            totalEntry.quantity += qtyTotal;
          } else {
            ingredientTotalDeductions.set(ingId, {
              name: cData.name,
              quantity: qtyTotal,
            });
          }
        }
      }

      processedItems.push({
        saleItemId,
        productId: variant.productId,
        productVariantId: variant.id,
        recipeVersionId: item.recipeVersionId ?? appliedRecipe?.id ?? null,
        productNameSnapshot: variant.product.name,
        variantNameSnapshot: variant.sizeLabel,
        baseUnitPriceVnd,
        quantity: item.quantity,
        taxRateBpsSnapshot: taxRateBps,
        taxAmountVnd: lineTaxVnd,
        subtotalVnd: lineSubtotalVnd,
        lineTotalVnd,
        note: item.note,
        toppings: processedToppings,
        consumptions: processedConsumptions,
      });
    }

    // 5. Phân tách rõ Cash Sale (PAID ngay) và ZaloPay (PAYMENT_PENDING)
    const isPaid = input.paymentMethod === 'CASH';
    const saleStatus = isPaid ? 'PAID' : 'PAYMENT_PENDING';
    const completedAt = isPaid ? now : null;

    const saleNumber =
      input.saleNumber ??
      `S${storeId}-${businessDate.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Nếu đơn hàng POS offline có gửi tổng số tiền đã thu (totalVnd, subtotalVnd, taxVnd),
    // ưu tiên giữ nguyên số tiền thực tế POS đã thu offline thay vì ép theo catalog hiện tại
    if (input.totalVnd !== undefined) {
      totalSaleAmountVnd = input.totalVnd;
      if (input.subtotalVnd !== undefined) {
        totalSaleSubtotalVnd = input.subtotalVnd;
      }
      if (input.taxVnd !== undefined) {
        totalSaleTaxVnd = input.taxVnd;
      }
    }

    // 6. Ghi nhận Sale
    const sale = await tx.sale.create({
      data: {
        id: saleId,
        storeId,
        deviceId,
        cashierUserId,
        registerSessionId: input.registerSessionId ?? null,
        saleNumber,
        status: saleStatus,
        subtotalVnd: totalSaleSubtotalVnd,
        taxVnd: totalSaleTaxVnd,
        totalVnd: totalSaleAmountVnd,
        note: input.note ?? null,
        businessDate,
        completedAt,
        createdAt: now,
        receivedAt: new Date(),
      },
    });

    // 7. Ghi nhận SaleItem, Toppings, Consumptions
    for (const pItem of processedItems) {
      await tx.saleItem.create({
        data: {
          id: pItem.saleItemId,
          saleId: sale.id,
          productId: pItem.productId,
          productVariantId: pItem.productVariantId,
          recipeVersionId: pItem.recipeVersionId,
          productNameSnapshot: pItem.productNameSnapshot,
          variantNameSnapshot: pItem.variantNameSnapshot,
          baseUnitPriceVnd: pItem.baseUnitPriceVnd,
          quantity: pItem.quantity,
          taxRateBpsSnapshot: pItem.taxRateBpsSnapshot,
          taxAmountVnd: pItem.taxAmountVnd,
          subtotalVnd: pItem.subtotalVnd,
          lineTotalVnd: pItem.lineTotalVnd,
          note: pItem.note ?? null,
          toppings: {
            create: pItem.toppings.map((t) => ({
              id: t.id,
              toppingId: t.toppingId,
              toppingNameSnapshot: t.toppingNameSnapshot,
              unitPriceVndSnapshot: t.unitPriceVndSnapshot,
              quantityPerItem: t.quantityPerItem,
            })),
          },
          consumptions: {
            create: pItem.consumptions.map((c) => ({
              id: c.id,
              ingredientId: c.ingredientId,
              ingredientNameSnapshot: c.ingredientNameSnapshot,
              unitSnapshot: c.unitSnapshot,
              quantityPerItem: c.quantityPerItem,
              quantityTotal: c.quantityTotal,
            })),
          },
        },
      });
    }

    // 8. Ghi nhận Payment
    const paymentId = randomUUID();
    const paymentAmount =
      input.amountVnd > 0n ? input.amountVnd : totalSaleAmountVnd;
    await tx.payment.create({
      data: {
        id: paymentId,
        saleId: sale.id,
        storeId,
        method: input.paymentMethod,
        provider:
          input.paymentMethod === 'CASH'
            ? 'INTERNAL'
            : `${input.paymentMethod}_SANDBOX`,
        status: isPaid ? 'PAID' : 'PENDING',
        amountVnd: paymentAmount,
        merchantOrderId: input.merchantOrderId ?? null,
        paidAt: completedAt,
      },
    });

    // 9. QUY TẮC BẤT KHẢ XÂM PHẠM: CHỈ trừ kho khi sale đã PAID (Cash sale)!
    // Online PAYMENT_PENDING tuyệt đối không tác động kho trước khi provider xác nhận.
    if (isPaid) {
      const sortedIngredientIds = Array.from(
        ingredientTotalDeductions.keys(),
      ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      await this.deductStockForSale(
        tx,
        storeId,
        sortedIngredientIds,
        ingredientTotalDeductions,
        saleNumber,
        completedAt!,
        sourceOperationId,
      );
    }

    return {
      id: sale.id,
      storeId: sale.storeId.toString(),
      deviceId: sale.deviceId,
      cashierUserId: sale.cashierUserId.toString(),
      registerSessionId: sale.registerSessionId ?? undefined,
      saleNumber: sale.saleNumber,
      status: sale.status,
      subtotalVnd: sale.subtotalVnd.toString(),
      taxVnd: sale.taxVnd.toString(),
      totalVnd: sale.totalVnd.toString(),
      note: sale.note ?? undefined,
      businessDate: businessDate.toISOString().slice(0, 10),
      completedAt: completedAt ? completedAt.toISOString() : '',
      createdAt: now.toISOString(),
      items: processedItems.map((p) => ({
        id: p.saleItemId,
        productId: p.productId.toString(),
        productName: p.productNameSnapshot,
        variantId: p.productVariantId.toString(),
        variantName: p.variantNameSnapshot,
        baseUnitPriceVnd: p.baseUnitPriceVnd.toString(),
        quantity: p.quantity,
        taxRateBps: p.taxRateBpsSnapshot,
        taxAmountVnd: p.taxAmountVnd.toString(),
        subtotalVnd: p.subtotalVnd.toString(),
        lineTotalVnd: p.lineTotalVnd.toString(),
        note: p.note,
        toppings: p.toppings.map((t) => ({
          id: t.id,
          toppingId: t.toppingId.toString(),
          toppingName: t.toppingNameSnapshot,
          unitPriceVnd: t.unitPriceVndSnapshot.toString(),
          quantityPerItem: t.quantityPerItem,
        })),
        consumptions: p.consumptions.map((c) => ({
          id: c.id,
          ingredientId: c.ingredientId.toString(),
          ingredientName: c.ingredientNameSnapshot,
          baseUnit: c.unitSnapshot,
          quantityPerItem: Number(c.quantityPerItem),
          quantityTotal: Number(c.quantityTotal),
        })),
      })),
      payments: [
        {
          id: paymentId,
          method: input.paymentMethod,
          provider:
            input.paymentMethod === 'CASH'
              ? 'INTERNAL'
              : `${input.paymentMethod}_SANDBOX`,
          status: isPaid ? 'PAID' : 'PENDING',
          amountVnd: input.amountVnd.toString(),
          merchantOrderId: input.merchantOrderId,
          paidAt: completedAt ? completedAt.toISOString() : undefined,
        },
      ],
    };
  }

  /**
   * Trừ tồn kho nguyên tử có khóa dòng SELECT FOR UPDATE theo thứ tự ingredientId tăng dần
   */
  async deductStockForSale(
    tx: Prisma.TransactionClient,
    storeId: bigint,
    sortedIngredientIds: bigint[],
    ingredientTotalDeductions: Map<bigint, { name: string; quantity: number }>,
    saleNumber: string,
    occurredAt: Date,
    sourceOperationId?: string,
  ) {
    for (const ingId of sortedIngredientIds) {
      const deductInfo = ingredientTotalDeductions.get(ingId)!;
      const deductQty = deductInfo.quantity;

      const rows = await tx.$queryRaw<
        Array<{ quantity: Prisma.Decimal; version: bigint }>
      >`
        SELECT quantity, version FROM stock_balances
        WHERE store_id = ${storeId} AND ingredient_id = ${ingId}
        FOR UPDATE
      `;

      const currentQty = rows.length > 0 ? Number(rows[0].quantity) : 0;
      const newQty = currentQty - deductQty;

      if (newQty < 0) {
        throw new BadRequestException(
          `Tồn kho không đủ cho nguyên liệu [${deductInfo.name}] (Hiện có: ${currentQty}, cần trừ: ${deductQty}).`,
        );
      }

      const newQtyDecimal = new Prisma.Decimal(newQty);
      const deltaDecimal = new Prisma.Decimal(-deductQty);

      if (rows.length === 0) {
        await tx.stockBalance.create({
          data: {
            storeId,
            ingredientId: ingId,
            quantity: newQtyDecimal,
            version: 1n,
          },
        });
      } else {
        await tx.stockBalance.update({
          where: { storeId_ingredientId: { storeId, ingredientId: ingId } },
          data: {
            quantity: newQtyDecimal,
            version: { increment: 1n },
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          id: randomUUID(),
          storeId,
          ingredientId: ingId,
          movementType: 'SALE_USAGE',
          quantityDelta: deltaDecimal,
          balanceAfter: newQtyDecimal,
          sourceOperationId: sourceOperationId ?? null,
          reason: `Đơn hàng ${saleNumber}`,
          occurredAt,
        },
      });
    }
  }

  /**
   * Kích hoạt xác nhận thanh toán ZaloPay từ Webhook callback:
   * Chuyển trạng thái Sale và Payment sang PAID, sau đó mới thực hiện trừ tồn kho!
   */
  async confirmOnlinePayment(
    tx: Prisma.TransactionClient,
    paymentId: string,
    providerTransId?: string,
  ) {
    const initial = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!initial) throw new NotFoundException('Không tìm thấy payment.');
    await lockStoreCheckout(tx, initial.storeId);
    // Lock the sale first to prevent multiple legacy payments settling it twice.
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${initial.saleId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        sale: {
          include: {
            items: {
              include: { consumptions: true },
            },
          },
        },
      },
    });

    if (!payment || payment.status === 'PAID') {
      return;
    }
    if (payment.status === 'CANCELLED' || payment.sale.status === 'CANCELLED') {
      throw new ConflictException(
        'PAYMENT_CANCELLED: Tiền về sau hủy phải đối soát riêng.',
      );
    }
    if (
      !['ZALOPAY', 'MOMO'].includes(payment.method) ||
      payment.sale.storeId !== payment.storeId ||
      payment.amountVnd !== payment.sale.totalVnd ||
      payment.sale.status === 'PAID' ||
      (payment.providerTransactionId &&
        payment.providerTransactionId !== providerTransId)
    ) {
      throw new BadRequestException(
        'Payment không khớp sale hoặc sale đã được thanh toán.',
      );
    }

    const now = new Date();

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        providerTransactionId: providerTransId,
        paidAt: now,
      },
    });

    await tx.sale.update({
      where: { id: payment.saleId },
      data: {
        status: 'PAID',
        completedAt: now,
      },
    });

    // Bây giờ mới kích hoạt trừ kho
    const ingredientDeductions = new Map<
      bigint,
      { name: string; quantity: number }
    >();
    for (const item of payment.sale.items) {
      for (const c of item.consumptions) {
        const existing = ingredientDeductions.get(c.ingredientId);
        const qty = Number(c.quantityTotal);
        if (existing) {
          existing.quantity += qty;
        } else {
          ingredientDeductions.set(c.ingredientId, {
            name: c.ingredientNameSnapshot,
            quantity: qty,
          });
        }
      }
    }

    const sortedIngIds = Array.from(ingredientDeductions.keys()).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );

    await this.deductStockForSale(
      tx,
      payment.storeId,
      sortedIngIds,
      ingredientDeductions,
      payment.sale.saleNumber,
      now,
    );
  }

  /** Compatibility for existing ZaloPay integrations. */
  async confirmZaloPayPayment(
    tx: Prisma.TransactionClient,
    paymentId: string,
    providerTransId?: string,
  ) {
    return this.confirmOnlinePayment(tx, paymentId, providerTransId);
  }

  async getSaleById(
    saleId: string,
    requestingStoreId?: bigint,
  ): Promise<SaleResponseDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            toppings: true,
            consumptions: true,
          },
        },
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(`Đơn hàng ${saleId} không tồn tại.`);
    }

    if (requestingStoreId && sale.storeId !== requestingStoreId) {
      throw new ForbiddenException(
        'Không có quyền xem đơn hàng của chi nhánh khác.',
      );
    }

    return {
      id: sale.id,
      storeId: sale.storeId.toString(),
      deviceId: sale.deviceId,
      cashierUserId: sale.cashierUserId.toString(),
      registerSessionId: sale.registerSessionId ?? undefined,
      saleNumber: sale.saleNumber,
      status: sale.status,
      subtotalVnd: sale.subtotalVnd.toString(),
      taxVnd: sale.taxVnd.toString(),
      totalVnd: sale.totalVnd.toString(),
      note: sale.note ?? undefined,
      businessDate: sale.businessDate.toISOString().slice(0, 10),
      completedAt: sale.completedAt ? sale.completedAt.toISOString() : '',
      createdAt: sale.createdAt.toISOString(),
      items: sale.items.map((i) => ({
        id: i.id,
        productId: i.productId.toString(),
        productName: i.productNameSnapshot,
        variantId: i.productVariantId.toString(),
        variantName: i.variantNameSnapshot,
        baseUnitPriceVnd: i.baseUnitPriceVnd.toString(),
        quantity: i.quantity,
        taxRateBps: i.taxRateBpsSnapshot,
        taxAmountVnd: i.taxAmountVnd.toString(),
        subtotalVnd: i.subtotalVnd.toString(),
        lineTotalVnd: i.lineTotalVnd.toString(),
        note: i.note ?? undefined,
        toppings: i.toppings.map((t) => ({
          id: t.id,
          toppingId: t.toppingId.toString(),
          toppingName: t.toppingNameSnapshot,
          unitPriceVnd: t.unitPriceVndSnapshot.toString(),
          quantityPerItem: t.quantityPerItem,
        })),
        consumptions: i.consumptions.map((c) => ({
          id: c.id,
          ingredientId: c.ingredientId.toString(),
          ingredientName: c.ingredientNameSnapshot,
          baseUnit: c.unitSnapshot,
          quantityPerItem: Number(c.quantityPerItem),
          quantityTotal: Number(c.quantityTotal),
        })),
      })),
      payments: sale.payments.map((p) => ({
        id: p.id,
        method: p.method,
        provider: p.provider,
        status: p.status,
        amountVnd: p.amountVnd.toString(),
        merchantOrderId: p.merchantOrderId ?? undefined,
        paidAt: p.paidAt ? p.paidAt.toISOString() : undefined,
      })),
    };
  }

  async getSales(options: {
    requestingRole: 'OWNER' | 'STORE_MANAGER';
    requestingHomeStoreId?: bigint;
    targetStoreId?: bigint;
    page?: number;
    pageSize?: number;
    search?: string;
    paymentMethod?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    let filterStoreId: bigint | undefined;

    if (options.requestingRole === 'STORE_MANAGER') {
      if (!options.requestingHomeStoreId) {
        throw new ForbiddenException('Tài khoản không được gán chi nhánh nhà.');
      }
      if (
        options.targetStoreId &&
        options.targetStoreId !== options.requestingHomeStoreId
      ) {
        throw new ForbiddenException(
          'Không có quyền xem đơn hàng của chi nhánh khác.',
        );
      }
      filterStoreId = options.requestingHomeStoreId;
    } else {
      if (options.targetStoreId) {
        filterStoreId = options.targetStoreId;
      }
    }

    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.SaleWhereInput = {
      status: 'PAID',
      ...(filterStoreId ? { storeId: filterStoreId } : {}),
      ...(options.search
        ? {
            saleNumber: {
              contains: options.search.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(options.paymentMethod
        ? {
            payments: {
              some: {
                method: options.paymentMethod.toUpperCase(),
                status: 'PAID',
              },
            },
          }
        : {}),
      ...(options.fromDate || options.toDate
        ? {
            completedAt: {
              ...(options.fromDate ? { gte: new Date(options.fromDate) } : {}),
              ...(options.toDate ? { lte: new Date(options.toDate) } : {}),
            },
          }
        : {}),
    };

    const [total, sales] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          store: true,
          cashierUser: true,
          payments: true,
          _count: {
            select: { items: true },
          },
        },
      }),
    ]);

    const items = sales.map((sale) => {
      const primaryPayment = sale.payments.find(
        (payment) => payment.status === 'PAID',
      );
      const method = primaryPayment?.method || 'CASH';

      return {
        id: sale.id,
        saleNumber: sale.saleNumber,
        storeId: sale.storeId.toString(),
        storeName: sale.store.name,
        cashierName: sale.cashierUser?.fullName || 'Thu ngân',
        status: sale.status,
        subtotalVnd: sale.subtotalVnd.toString(),
        taxVnd: sale.taxVnd.toString(),
        totalVnd: sale.totalVnd.toString(),
        completedAt: sale.completedAt ? sale.completedAt.toISOString() : null,
        createdAt: sale.createdAt.toISOString(),
        paymentMethod:
          method === 'MOMO'
            ? 'MoMo'
            : method === 'ZALOPAY'
              ? 'ZaloPay'
              : 'Tiền mặt',
        itemCount: sale._count.items,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
