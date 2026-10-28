import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { WebPrincipalUtil } from '../common/security/web-principal.util';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {}

  private priceVnd(value: string): bigint {
    if (!/^(0|[1-9]\d*)$/.test(value))
      throw new BadRequestException('Invalid VND price.');
    const price = BigInt(value);
    if (price > 1_000_000_000n)
      throw new BadRequestException('VND price is too large.');
    return price;
  }

  private async authenticateCaller(authorization?: string) {
    if (authorization && authorization.startsWith('Bearer ')) {
      WebPrincipalUtil.requireOwnerOrManager(authorization);
      return;
    }
    await this.devicesService.authenticateDevice(authorization);
  }

  async getCategories(authorization?: string) {
    await this.authenticateCaller(authorization);
    const categories = await this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories.map((category) => ({
      id: category.id.toString(),
      name: category.name,
      sortOrder: category.sortOrder,
      taxRateBps: category.taxRateBps,
      updatedAt: category.updatedAt.toISOString(),
    }));
  }

  async getProducts(authorization?: string, includeInactive = false) {
    await this.authenticateCaller(authorization);
    const products = await this.prisma.product.findMany({
      where: includeInactive
        ? {}
        : {
            isActive: true,
            category: { isActive: true },
            variants: { some: { isActive: true } },
          },
      include: {
        category: true,
        variants: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { priceVnd: 'asc' }],
        },
        allowedToppings: {
          include: { topping: true },
          where: { topping: { isActive: true } },
          orderBy: { topping: { name: 'asc' } },
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });

    return products.map((product) => ({
      id: product.id.toString(),
      code: product.code,
      name: product.name,
      isActive: product.isActive,
      description: product.description,
      category: {
        id: product.category.id.toString(),
        name: product.category.name,
        taxRateBps: product.category.taxRateBps,
      },
      variants: product.variants.map((variant) => ({
        id: variant.id.toString(),
        code: variant.code,
        sizeLabel: variant.sizeLabel,
        priceVnd: variant.priceVnd.toString(),
        isDefault: variant.isDefault,
      })),
      toppings: product.allowedToppings.map(({ topping }) => ({
        id: topping.id.toString(),
        code: topping.code,
        name: topping.name,
        priceVnd: topping.priceVnd.toString(),
      })),
      updatedAt: product.updatedAt.toISOString(),
    }));
  }

  async getToppings() {
    const toppings = await this.prisma.topping.findMany({
      orderBy: { name: 'asc' },
    });
    return toppings.map((topping) => ({
      id: topping.id.toString(),
      code: topping.code,
      name: topping.name,
      priceVnd: topping.priceVnd.toString(),
      isActive: topping.isActive,
    }));
  }

  async updateVariantPrice(variantId: bigint, value: string) {
    const priceVnd = this.priceVnd(value);
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
      });
      if (!variant) throw new NotFoundException('Product variant not found.');
      const updatedVariant = await tx.productVariant.update({
        where: { id: variantId },
        data: { priceVnd },
      });
      const product = await tx.product.findUnique({
        where: { id: variant.productId },
        include: { variants: true, allowedToppings: true },
      });
      if (!product) throw new NotFoundException('Product not found.');
      await tx.syncChange.create({
        data: {
          storeId: null,
          entityType: 'products',
          entityId: product.id.toString(),
          changeType: 'UPSERT',
          payload: {
            id: product.id.toString(),
            categoryId: product.categoryId.toString(),
            code: product.code,
            name: product.name,
            description: product.description,
            isActive: product.isActive,
            variants: product.variants.map((item) => ({
              id: item.id.toString(),
              code: item.code,
              sizeLabel: item.sizeLabel,
              priceVnd: item.priceVnd.toString(),
              isDefault: item.isDefault,
              isActive: item.isActive,
            })),
            allowedToppingIds: product.allowedToppings.map((item) =>
              item.toppingId.toString(),
            ),
          },
          changedAt: new Date(),
        },
      });
      return {
        id: updatedVariant.id.toString(),
        productId: updatedVariant.productId.toString(),
        priceVnd: updatedVariant.priceVnd.toString(),
      };
    });
  }

  async updateCategoryTax(categoryId: bigint, taxRateBps: number) {
    if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
      throw new BadRequestException('Invalid VAT basis points.');
    }
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.findUnique({
        where: { id: categoryId },
      });
      if (!category) throw new NotFoundException('Category not found.');
      const updated = await tx.productCategory.update({
        where: { id: categoryId },
        data: { taxRateBps },
      });
      await tx.syncChange.create({
        data: {
          storeId: null,
          entityType: 'product_categories',
          entityId: updated.id.toString(),
          changeType: 'UPSERT',
          payload: {
            id: updated.id.toString(),
            name: updated.name,
            sortOrder: updated.sortOrder,
            taxRateBps: updated.taxRateBps,
            isActive: updated.isActive,
          },
          changedAt: new Date(),
        },
      });
      return {
        id: updated.id.toString(),
        name: updated.name,
        sortOrder: updated.sortOrder,
        taxRateBps: updated.taxRateBps,
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async updateToppingPrice(toppingId: bigint, value: string) {
    const priceVnd = this.priceVnd(value);
    return this.prisma.$transaction(async (tx) => {
      const topping = await tx.topping.findUnique({ where: { id: toppingId } });
      if (!topping) throw new NotFoundException('Topping not found.');
      const updated = await tx.topping.update({
        where: { id: toppingId },
        data: { priceVnd },
      });
      await tx.syncChange.create({
        data: {
          storeId: null,
          entityType: 'toppings',
          entityId: updated.id.toString(),
          changeType: 'UPSERT',
          payload: {
            id: updated.id.toString(),
            code: updated.code,
            name: updated.name,
            priceVnd: updated.priceVnd.toString(),
            isActive: updated.isActive,
          },
          changedAt: new Date(),
        },
      });
      return {
        id: updated.id.toString(),
        code: updated.code,
        name: updated.name,
        priceVnd: updated.priceVnd.toString(),
        isActive: updated.isActive,
      };
    });
  }

  async updateProductStatus(productId: bigint, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        throw new NotFoundException(`Sản phẩm ${productId} không tồn tại.`);
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: { isActive },
        include: {
          category: true,
          variants: true,
          allowedToppings: true,
        },
      });

      await tx.syncChange.create({
        data: {
          storeId: null,
          entityType: 'products',
          entityId: updated.id.toString(),
          changeType: 'UPSERT',
          payload: {
            id: updated.id.toString(),
            categoryId: updated.categoryId.toString(),
            code: updated.code,
            name: updated.name,
            description: updated.description,
            isActive: updated.isActive,
            variants: updated.variants.map((v) => ({
              id: v.id.toString(),
              code: v.code,
              sizeLabel: v.sizeLabel,
              priceVnd: v.priceVnd.toString(),
              isDefault: v.isDefault,
              isActive: v.isActive,
            })),
            allowedToppingIds: updated.allowedToppings.map((pt) =>
              pt.toppingId.toString(),
            ),
          },
          changedAt: new Date(),
        },
      });

      return {
        id: updated.id.toString(),
        code: updated.code,
        name: updated.name,
        isActive: updated.isActive,
      };
    });
  }

  async deleteProduct(productId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        throw new NotFoundException(`Sản phẩm ${productId} không tồn tại.`);
      }

      await tx.product.update({
        where: { id: productId },
        data: { isActive: false },
      });

      await tx.syncChange.create({
        data: {
          storeId: null,
          entityType: 'products',
          entityId: product.id.toString(),
          changeType: 'DELETE',
          payload: {
            id: product.id.toString(),
            code: product.code,
            name: product.name,
            isActive: false,
          },
          changedAt: new Date(),
        },
      });

      return {
        id: product.id.toString(),
        deleted: true,
      };
    });
  }
}
