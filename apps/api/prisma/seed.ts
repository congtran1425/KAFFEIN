import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { CryptoUtil } from '../src/common/security/crypto.util';
import { ensureDemoEmployees } from './seed-employees';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const target = new URL(connectionString);
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/coffee_pos'
) {
  throw new Error('Demo seed is restricted to the local coffee_pos database');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
});

async function main(): Promise<void> {
  const store1 = await prisma.store.upsert({
    where: { code: 'DEMO-HCM-01' },
    update: {
      name: 'Nguyễn Đình Chiểu - Đa Kao',
      address: '59C Nguyễn Đình Chiểu, P. Đa Kao, TP.HCM',
    },
    create: {
      code: 'DEMO-HCM-01',
      name: 'Nguyễn Đình Chiểu - Đa Kao',
      address: '59C Nguyễn Đình Chiểu, P. Đa Kao, TP.HCM',
    },
  });
  const store2 = await prisma.store.upsert({
    where: { code: 'DEMO-HCM-02' },
    update: {
      name: 'Quốc Hương - Thảo Điền',
      address: '12 Quốc Hương, P. Thảo Điền, TP. Thủ Đức, TP.HCM',
    },
    create: {
      code: 'DEMO-HCM-02',
      name: 'Quốc Hương - Thảo Điền',
      address: '12 Quốc Hương, P. Thảo Điền, TP. Thủ Đức, TP.HCM',
    },
  });

  const { cashier1 } = await ensureDemoEmployees(prisma, store1.id, store2.id);

  const demoPin = process.env.DEMO_EMPLOYEE_PIN;
  if (demoPin) {
    if (!/^\d{4}$/.test(demoPin)) {
      throw new Error('DEMO_EMPLOYEE_PIN must contain exactly 4 digits');
    }
    const demoEmployee = cashier1;
    await prisma.employeePinCredential.upsert({
      where: { userId: demoEmployee.id },
      update: {
        pinHash: await CryptoUtil.hashPin(demoPin),
        pinVersion: { increment: 1 },
        failedAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: demoEmployee.id,
        pinHash: await CryptoUtil.hashPin(demoPin),
      },
    });
  }

  const coffeeCategory = await prisma.productCategory.upsert({
    where: { name: 'Cà phê' },
    update: {},
    create: { name: 'Cà phê', sortOrder: 1, taxRateBps: 0 },
  });
  const breakfastCategory = await prisma.productCategory.upsert({
    where: { name: 'Điểm tâm' },
    update: {},
    create: { name: 'Điểm tâm', sortOrder: 2, taxRateBps: 0 },
  });

  const coffee = await prisma.product.upsert({
    where: { code: 'CF01' },
    update: { categoryId: coffeeCategory.id },
    create: {
      categoryId: coffeeCategory.id,
      code: 'CF01',
      name: 'Cà phê sữa đá',
      description: 'Dữ liệu demo',
    },
  });
  const croissant = await prisma.product.upsert({
    where: { code: 'DT01' },
    update: { categoryId: breakfastCategory.id },
    create: {
      categoryId: breakfastCategory.id,
      code: 'DT01',
      name: 'Croissant bơ',
      description: 'Dữ liệu demo',
    },
  });

  for (const variant of [
    { productId: coffee.id, code: 'M', sizeLabel: 'M', priceVnd: 35000n, isDefault: true },
    { productId: coffee.id, code: 'L', sizeLabel: 'L', priceVnd: 45000n, isDefault: false },
    { productId: croissant.id, code: 'ONE', sizeLabel: 'Phần', priceVnd: 38000n, isDefault: true },
  ]) {
    await prisma.productVariant.upsert({
      where: { productId_code: { productId: variant.productId, code: variant.code } },
      update: {
        sizeLabel: variant.sizeLabel,
        priceVnd: variant.priceVnd,
        isDefault: variant.isDefault,
      },
      create: variant,
    });
  }

  const pearl = await prisma.topping.upsert({
    where: { code: 'TOP01' },
    update: {},
    create: { code: 'TOP01', name: 'Trân châu', priceVnd: 10000n },
  });
  await prisma.productTopping.upsert({
    where: { productId_toppingId: { productId: coffee.id, toppingId: pearl.id } },
    update: {},
    create: { productId: coffee.id, toppingId: pearl.id },
  });

  // 1. Master Data: Nguyên liệu (Ingredients)
  const coffeeBeans = await prisma.ingredient.upsert({
    where: { code: 'ING_COFFEE_BEANS' },
    update: {},
    create: { code: 'ING_COFFEE_BEANS', name: 'Hạt cà phê Robusta', baseUnit: 'G' },
  });
  const condensedMilk = await prisma.ingredient.upsert({
    where: { code: 'ING_CONDENSED_MILK' },
    update: {},
    create: { code: 'ING_CONDENSED_MILK', name: 'Sữa đặc', baseUnit: 'G' },
  });
  const freshMilk = await prisma.ingredient.upsert({
    where: { code: 'ING_FRESH_MILK' },
    update: {},
    create: { code: 'ING_FRESH_MILK', name: 'Sữa tươi thanh trùng', baseUnit: 'ML' },
  });
  const pearlIng = await prisma.ingredient.upsert({
    where: { code: 'ING_PEARL' },
    update: {},
    create: { code: 'ING_PEARL', name: 'Trân châu đen', baseUnit: 'G' },
  });
  const croissantDough = await prisma.ingredient.upsert({
    where: { code: 'ING_CROISSANT_DOUGH' },
    update: {},
    create: { code: 'ING_CROISSANT_DOUGH', name: 'Bột bánh sừng bò', baseUnit: 'PIECE' },
  });

  // 2. Định mức nguyên liệu cho Topping
  await prisma.toppingItem.upsert({
    where: { toppingId_ingredientId: { toppingId: pearl.id, ingredientId: pearlIng.id } },
    update: { quantity: 40 },
    create: { toppingId: pearl.id, ingredientId: pearlIng.id, quantity: 40 },
  });

  // 3. Công thức (Recipes) cho các biến thể Size M và L
  const coffeeVariantM = await prisma.productVariant.findUniqueOrThrow({
    where: { productId_code: { productId: coffee.id, code: 'M' } },
  });
  const coffeeVariantL = await prisma.productVariant.findUniqueOrThrow({
    where: { productId_code: { productId: coffee.id, code: 'L' } },
  });
  const croissantVariant = await prisma.productVariant.findUniqueOrThrow({
    where: { productId_code: { productId: croissant.id, code: 'ONE' } },
  });

  const recipeM = await prisma.recipeVersion.upsert({
    where: { productVariantId_versionNo: { productVariantId: coffeeVariantM.id, versionNo: 1 } },
    update: { status: 'ACTIVE' },
    create: { productVariantId: coffeeVariantM.id, versionNo: 1, status: 'ACTIVE' },
  });
  await prisma.recipeItem.upsert({
    where: { recipeVersionId_ingredientId: { recipeVersionId: recipeM.id, ingredientId: coffeeBeans.id } },
    update: { quantity: 20 },
    create: { recipeVersionId: recipeM.id, ingredientId: coffeeBeans.id, quantity: 20 },
  });
  await prisma.recipeItem.upsert({
    where: { recipeVersionId_ingredientId: { recipeVersionId: recipeM.id, ingredientId: condensedMilk.id } },
    update: { quantity: 30 },
    create: { recipeVersionId: recipeM.id, ingredientId: condensedMilk.id, quantity: 30 },
  });

  const recipeL = await prisma.recipeVersion.upsert({
    where: { productVariantId_versionNo: { productVariantId: coffeeVariantL.id, versionNo: 1 } },
    update: { status: 'ACTIVE' },
    create: { productVariantId: coffeeVariantL.id, versionNo: 1, status: 'ACTIVE' },
  });
  await prisma.recipeItem.upsert({
    where: { recipeVersionId_ingredientId: { recipeVersionId: recipeL.id, ingredientId: coffeeBeans.id } },
    update: { quantity: 30 },
    create: { recipeVersionId: recipeL.id, ingredientId: coffeeBeans.id, quantity: 30 },
  });
  await prisma.recipeItem.upsert({
    where: { recipeVersionId_ingredientId: { recipeVersionId: recipeL.id, ingredientId: condensedMilk.id } },
    update: { quantity: 45 },
    create: { recipeVersionId: recipeL.id, ingredientId: condensedMilk.id, quantity: 45 },
  });

  const recipeCroissant = await prisma.recipeVersion.upsert({
    where: { productVariantId_versionNo: { productVariantId: croissantVariant.id, versionNo: 1 } },
    update: { status: 'ACTIVE' },
    create: { productVariantId: croissantVariant.id, versionNo: 1, status: 'ACTIVE' },
  });
  await prisma.recipeItem.upsert({
    where: { recipeVersionId_ingredientId: { recipeVersionId: recipeCroissant.id, ingredientId: croissantDough.id } },
    update: { quantity: 1 },
    create: { recipeVersionId: recipeCroissant.id, ingredientId: croissantDough.id, quantity: 1 },
  });

  // 4. Số dư tồn kho ban đầu cho Chi nhánh 1 (Store 1)
  const initialStock = [
    { ingredientId: coffeeBeans.id, quantity: 10000 },
    { ingredientId: condensedMilk.id, quantity: 5000 },
    { ingredientId: freshMilk.id, quantity: 10000 },
    { ingredientId: pearlIng.id, quantity: 3000 },
    { ingredientId: croissantDough.id, quantity: 50 },
  ];
  for (const item of initialStock) {
    await prisma.stockBalance.upsert({
      where: { storeId_ingredientId: { storeId: store1.id, ingredientId: item.ingredientId } },
      update: { quantity: item.quantity },
      create: { storeId: store1.id, ingredientId: item.ingredientId, quantity: item.quantity },
    });
  }

  // A revoked historical row demonstrates device history without occupying the
  // one ACTIVE slot or creating a usable device credential.
  await prisma.device.upsert({
    where: { id: '018f0000-0000-7000-8000-000000000001' },
    update: {},
    create: {
      id: '018f0000-0000-7000-8000-000000000001',
      storeId: store1.id,
      displayName: '[DEMO] Thiết bị đã thu hồi',
      status: 'REVOKED',
      credentialHash: '!unusable-demo-credential',
      revokedAt: new Date(),
    },
  });

  console.log('Demo seed ready: stores, users, catalog, recipes, stock balances and revoked-device history.');
  console.log('No web password or active device was created.');
  console.log(demoPin ? 'Demo employee PIN was set from the environment.' : 'Demo employee PIN was not configured.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
