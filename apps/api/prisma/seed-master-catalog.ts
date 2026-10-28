import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { CryptoUtil } from '../src/common/security/crypto.util';
import { ensureDemoEmployees } from './seed-employees';

// Nạp biến môi trường
config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
config({ path: resolve(process.cwd(), '.env'), quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const target = new URL(connectionString);
const initializeEmptyVps =
  process.env.KAFFEIN_INITIALIZE_EMPTY_DB === 'YES_INITIALIZE_EMPTY_DEMO_DB' &&
  target.hostname === 'db' &&
  target.pathname === '/coffee_pos';
const initializeEmptyAws =
  process.env.KAFFEIN_INITIALIZE_EMPTY_DB === 'YES_INITIALIZE_EMPTY_DEMO_DB' &&
  process.env.KAFFEIN_AWS_DB_HOST === target.hostname &&
  target.hostname.endsWith('.ap-southeast-1.rds.amazonaws.com') &&
  target.pathname === '/kaffein_pos';
const initializeEmptyCloud = initializeEmptyVps || initializeEmptyAws;
if (
  !initializeEmptyCloud &&
  (!['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname !== '/coffee_pos')
) {
  throw new Error('Seed requires local coffee_pos or explicit empty cloud initialization');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
});

async function main(): Promise<void> {
  if (initializeEmptyCloud) {
    const counts = await Promise.all([
      prisma.store.count(), prisma.user.count(), prisma.product.count(),
      prisma.ingredient.count(), prisma.sale.count(), prisma.device.count(),
      prisma.stockBalance.count(),
    ]);
    if (counts.some((count) => count !== 0)) {
      throw new Error('Refusing cloud seed: database already contains application data');
    }
    if (!process.env.DEMO_WEB_PASSWORD || process.env.DEMO_WEB_PASSWORD.length < 16) {
      throw new Error('Empty cloud initialization requires a generated DEMO_WEB_PASSWORD');
    }
  }
  console.log('🚀 Bắt đầu nạp Master Catalog mở rộng (28 món, 21 nguyên liệu, 5 topping)...');

  // 1. Chi nhánh
  const store1 = await prisma.store.upsert({
    where: { code: 'DEMO-HCM-01' },
    update: { name: 'Nguyễn Đình Chiểu - Đa Kao', address: '59C Nguyễn Đình Chiểu, P. Đa Kao, TP.HCM' },
    create: {
      code: 'DEMO-HCM-01',
      name: 'Nguyễn Đình Chiểu - Đa Kao',
      address: '59C Nguyễn Đình Chiểu, P. Đa Kao, TP.HCM',
    },
  });

  const store2 = await prisma.store.upsert({
    where: { code: 'DEMO-HCM-02' },
    update: { name: 'Quốc Hương - Thảo Điền', address: '12 Quốc Hương, P. Thảo Điền, TP. Thủ Đức, TP.HCM' },
    create: {
      code: 'DEMO-HCM-02',
      name: 'Quốc Hương - Thảo Điền',
      address: '12 Quốc Hương, P. Thảo Điền, TP. Thủ Đức, TP.HCM',
    },
  });

  // 2. Tài khoản quản trị & nhân sự demo
  const { owner, manager1, cashier1 } = await ensureDemoEmployees(prisma, store1.id, store2.id);

  // VPS receives a generated password through the private environment file.
  const defaultPasswordHash = await CryptoUtil.hashPin(
    initializeEmptyCloud ? process.env.DEMO_WEB_PASSWORD! : '123456',
  );
  await prisma.webCredential.upsert({
    where: { userId: owner.id },
    update: { passwordHash: defaultPasswordHash },
    create: { userId: owner.id, email: 'owner@coffeepos.vn', passwordHash: defaultPasswordHash },
  });
  await prisma.webCredential.upsert({
    where: { userId: manager1.id },
    update: { passwordHash: defaultPasswordHash },
    create: { userId: manager1.id, email: 'manager.q1@coffeepos.vn', passwordHash: defaultPasswordHash },
  });

  // PIN 4 số demo cho thu ngân (1234)
  const demoPinHash = await CryptoUtil.hashPin('1234');
  await prisma.employeePinCredential.upsert({
    where: { userId: cashier1.id },
    update: { pinHash: demoPinHash },
    create: { userId: cashier1.id, pinHash: demoPinHash },
  });

  // 3. DANH MỤC SẢN PHẨM (ProductCategory) - 4 danh mục cố định
  console.log('📦 Cập nhật 4 danh mục cốt lõi...');
  const catCoffee = await prisma.productCategory.upsert({
    where: { name: 'Cà phê' },
    update: { sortOrder: 1, taxRateBps: 0, isActive: true },
    create: { name: 'Cà phê', sortOrder: 1, taxRateBps: 0, isActive: true },
  });

  const catTea = await prisma.productCategory.upsert({
    where: { name: 'Trà & Trà trái cây' },
    update: { sortOrder: 2, taxRateBps: 0, isActive: true },
    create: { name: 'Trà & Trà trái cây', sortOrder: 2, taxRateBps: 0, isActive: true },
  });

  const catMilkTea = await prisma.productCategory.upsert({
    where: { name: 'Trà sữa & Đá xay' },
    update: { sortOrder: 3, taxRateBps: 0, isActive: true },
    create: { name: 'Trà sữa & Đá xay', sortOrder: 3, taxRateBps: 0, isActive: true },
  });

  const catBakery = await prisma.productCategory.upsert({
    where: { name: 'Bánh & Món ăn kèm' },
    update: { sortOrder: 4, taxRateBps: 0, isActive: true },
    create: { name: 'Bánh & Món ăn kèm', sortOrder: 4, taxRateBps: 0, isActive: true },
  });

  // 4. DANH MỤC NGUYÊN LIỆU MASTER (21 nguyên liệu)
  console.log('🌾 Cập nhật 21 nguyên liệu chuẩn master...');
  const ingredientsData = [
    { code: 'ING_COFFEE_ROBUSTA', name: 'Hạt cà phê Robusta Pleiku', baseUnit: 'G' },
    { code: 'ING_COFFEE_ARABICA', name: 'Hạt cà phê Arabica Cầu Đất', baseUnit: 'G' },
    { code: 'ING_CONDENSED_MILK', name: 'Sữa đặc có đường Phương Nam', baseUnit: 'G' },
    { code: 'ING_FRESH_MILK', name: 'Sữa tươi thanh trùng Dalat Milk', baseUnit: 'ML' },
    { code: 'ING_SALT_CREAM', name: 'Kem béo muối biển', baseUnit: 'ML' },
    { code: 'ING_SYRUP_CARAMEL', name: 'Siro Caramel Torani', baseUnit: 'ML' },
    { code: 'ING_SYRUP_VANILLA', name: 'Siro Vanilla tự nhiên', baseUnit: 'ML' },
    { code: 'ING_SYRUP_PEACH', name: 'Siro Đào nguyên chất', baseUnit: 'ML' },
    { code: 'ING_SYRUP_LYCHEE', name: 'Siro Vải ngọt thanh', baseUnit: 'ML' },
    { code: 'ING_TEA_OOLONG', name: 'Cốt trà Ô long rang mộc', baseUnit: 'ML' },
    { code: 'ING_TEA_JASMINE', name: 'Cốt trà Lài (Hoa nhài)', baseUnit: 'ML' },
    { code: 'ING_MATCHA_POWDER', name: 'Bột trà xanh Uji Matcha', baseUnit: 'G' },
    { code: 'ING_COCOA_POWDER', name: 'Bột Cacao nguyên chất', baseUnit: 'G' },
    { code: 'ING_PEARL_RAW', name: 'Trân châu đen nấu sẵn', baseUnit: 'G' },
    { code: 'ING_COFFEE_JELLY', name: 'Thạch cà phê giòn', baseUnit: 'G' },
    { code: 'ING_PEACH_SLICES', name: 'Đào miếng ngâm đường', baseUnit: 'G' },
    { code: 'ING_CHEESE_CREAM', name: 'Váng sữa phô mai (Cheese Macchiato)', baseUnit: 'ML' },
    { code: 'ING_LOTUS_SEED', name: 'Hạt sen Huế ninh đường', baseUnit: 'G' },
    { code: 'ING_CROISSANT_DOUGH', name: 'Bánh sừng bò đông lạnh', baseUnit: 'PIECE' },
    { code: 'ING_TIRAMISU_CAKE', name: 'Bánh Mousse Tiramisu phần', baseUnit: 'PIECE' },
    { code: 'ING_CHEESECAKE', name: 'Bánh phô mai nướng Basque', baseUnit: 'PIECE' },
  ];

  const ingredientMap = new Map<string, any>();
  for (const item of ingredientsData) {
    const ing = await prisma.ingredient.upsert({
      where: { code: item.code },
      update: { name: item.name, baseUnit: item.baseUnit },
      create: item,
    });
    ingredientMap.set(item.code, ing);
  }

  // 5. TOPPING BÁN KÈM (5 Topping)
  console.log('🧋 Cập nhật 5 loại topping bán kèm...');
  const toppingsData = [
    { code: 'TOP01', name: 'Trân châu đen dẻo', priceVnd: 10000n, ingCode: 'ING_PEARL_RAW', qty: 40 },
    { code: 'TOP02', name: 'Thạch cà phê giòn', priceVnd: 10000n, ingCode: 'ING_COFFEE_JELLY', qty: 45 },
    { code: 'TOP03', name: 'Thạch đào giòn (Đào miếng thêm)', priceVnd: 10000n, ingCode: 'ING_PEACH_SLICES', qty: 50 },
    { code: 'TOP04', name: 'Kem Cheese Macchiato', priceVnd: 12000n, ingCode: 'ING_CHEESE_CREAM', qty: 40 },
    { code: 'TOP05', name: 'Hạt sen bổ dưỡng', priceVnd: 12000n, ingCode: 'ING_LOTUS_SEED', qty: 40 },
  ];

  const toppingMap = new Map<string, any>();
  for (const t of toppingsData) {
    const topping = await prisma.topping.upsert({
      where: { code: t.code },
      update: { name: t.name, priceVnd: t.priceVnd, isActive: true },
      create: { code: t.code, name: t.name, priceVnd: t.priceVnd, isActive: true },
    });
    toppingMap.set(t.code, topping);

    const ing = ingredientMap.get(t.ingCode);
    if (ing) {
      await prisma.toppingItem.upsert({
        where: { toppingId_ingredientId: { toppingId: topping.id, ingredientId: ing.id } },
        update: { quantity: t.qty },
        create: { toppingId: topping.id, ingredientId: ing.id, quantity: t.qty },
      });
    }
  }

  // 6. DANH SÁCH 28 SẢN PHẨM & CÔNG THỨC (BOM)
  console.log('☕ Cập nhật 28 sản phẩm, biến thể size và công thức...');

  interface ProductSeedDef {
    code: string;
    name: string;
    categoryId: bigint;
    description: string;
    allowedToppings: string[];
    variants: {
      code: string;
      sizeLabel: string;
      priceVnd: bigint;
      isDefault: boolean;
      recipe: { ingCode: string; qty: number }[];
    }[];
  }

  const productsList: ProductSeedDef[] = [
    // NHÓM 1: CÀ PHÊ (9 món)
    {
      code: 'CF01',
      name: 'Cà phê sữa đá truyền thống',
      categoryId: catCoffee.id,
      description: 'Hạt Robusta Pleiku pha phin đậm đà hòa quyện cùng sữa đặc béo ngọt.',
      allowedToppings: ['TOP01', 'TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 29000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 15 }, { ingCode: 'ING_CONDENSED_MILK', qty: 25 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 35000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 20 }, { ingCode: 'ING_CONDENSED_MILK', qty: 30 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 42000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 30 }, { ingCode: 'ING_CONDENSED_MILK', qty: 45 }] },
      ],
    },
    {
      code: 'CF02',
      name: 'Cà phê đen đá đậm vị',
      categoryId: catCoffee.id,
      description: 'Cà phê Robusta mộc nguyên chất, hậu vị đậm đà chuẩn gu Việt.',
      allowedToppings: ['TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 25000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 15 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 29000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 20 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 35000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 30 }] },
      ],
    },
    {
      code: 'CF03',
      name: 'Bạc xỉu ba tầng Sài Gòn',
      categoryId: catCoffee.id,
      description: 'Sữa đặc, sữa tươi thanh trùng và lớp cà phê thơm lừng tạo nên 3 tầng màu tuyệt đẹp.',
      allowedToppings: ['TOP01', 'TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 32000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 10 }, { ingCode: 'ING_CONDENSED_MILK', qty: 30 }, { ingCode: 'ING_FRESH_MILK', qty: 50 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 38000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 15 }, { ingCode: 'ING_CONDENSED_MILK', qty: 35 }, { ingCode: 'ING_FRESH_MILK', qty: 60 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 45000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 20 }, { ingCode: 'ING_CONDENSED_MILK', qty: 45 }, { ingCode: 'ING_FRESH_MILK', qty: 80 }] },
      ],
    },
    {
      code: 'CF04',
      name: 'Cà phê muối béo ngậy',
      categoryId: catCoffee.id,
      description: 'Cà phê sữa đá truyền thống phủ lớp kem béo mặn mà độc đáo.',
      allowedToppings: ['TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 35000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 15 }, { ingCode: 'ING_CONDENSED_MILK', qty: 20 }, { ingCode: 'ING_SALT_CREAM', qty: 30 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 42000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 20 }, { ingCode: 'ING_CONDENSED_MILK', qty: 25 }, { ingCode: 'ING_SALT_CREAM', qty: 40 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 49000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 30 }, { ingCode: 'ING_CONDENSED_MILK', qty: 35 }, { ingCode: 'ING_SALT_CREAM', qty: 50 }] },
      ],
    },
    {
      code: 'CF05',
      name: 'Cà phê ủ lạnh Cold Brew Cam',
      categoryId: catCoffee.id,
      description: 'Cà phê Arabica ủ lạnh 16 tiếng kết hợp vị chua ngọt thanh mát của cam vàng.',
      allowedToppings: [],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 39000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 15 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 45000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 20 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 52000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 30 }] },
      ],
    },
    {
      code: 'CF06',
      name: 'Cà phê Latte Cầu Đất',
      categoryId: catCoffee.id,
      description: 'Espresso Arabica Cầu Đất kết hợp sữa tươi thanh trùng đánh nóng mềm mượt.',
      allowedToppings: ['TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 42000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 15 }, { ingCode: 'ING_FRESH_MILK', qty: 160 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 49000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 18 }, { ingCode: 'ING_FRESH_MILK', qty: 200 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 56000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 24 }, { ingCode: 'ING_FRESH_MILK', qty: 260 }] },
      ],
    },
    {
      code: 'CF07',
      name: 'Cà phê Cappuccino bọt sữa',
      categoryId: catCoffee.id,
      description: 'Espresso với lớp bọt sữa dày dặn bồng bềnh phủ bột cacao.',
      allowedToppings: [],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 42000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 15 }, { ingCode: 'ING_FRESH_MILK', qty: 140 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 49000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 18 }, { ingCode: 'ING_FRESH_MILK', qty: 180 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 56000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 24 }, { ingCode: 'ING_FRESH_MILK', qty: 240 }] },
      ],
    },
    {
      code: 'CF08',
      name: 'Cà phê Americano thanh nhẹ',
      categoryId: catCoffee.id,
      description: 'Espresso pha loãng nước tinh khiết, nhẹ nhàng và thanh thoát.',
      allowedToppings: ['TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 35000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 15 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 40000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 18 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 45000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 24 }] },
      ],
    },
    {
      code: 'CF09',
      name: 'Caramel Macchiato ngọt ngào',
      categoryId: catCoffee.id,
      description: 'Sữa tươi vanilla ngọt dịu, đánh thức bởi shot espresso và sốt caramel.',
      allowedToppings: ['TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 45000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 15 }, { ingCode: 'ING_FRESH_MILK', qty: 140 }, { ingCode: 'ING_SYRUP_CARAMEL', qty: 20 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 52000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 18 }, { ingCode: 'ING_FRESH_MILK', qty: 180 }, { ingCode: 'ING_SYRUP_CARAMEL', qty: 25 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 59000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ARABICA', qty: 24 }, { ingCode: 'ING_FRESH_MILK', qty: 240 }, { ingCode: 'ING_SYRUP_CARAMEL', qty: 35 }] },
      ],
    },

    // NHÓM 2: TRÀ & TRÀ TRÁI CÂY (7 món)
    {
      code: 'TEA01',
      name: 'Trà đào cam sả',
      categoryId: catTea.id,
      description: 'Cốt trà lài thanh khiết, hương sả tươi, cam vàng và đào miếng giòn ngọt.',
      allowedToppings: ['TOP03', 'TOP04'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 39000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 120 }, { ingCode: 'ING_SYRUP_PEACH', qty: 25 }, { ingCode: 'ING_PEACH_SLICES', qty: 35 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 45000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 150 }, { ingCode: 'ING_SYRUP_PEACH', qty: 30 }, { ingCode: 'ING_PEACH_SLICES', qty: 50 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 52000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 200 }, { ingCode: 'ING_SYRUP_PEACH', qty: 40 }, { ingCode: 'ING_PEACH_SLICES', qty: 75 }] },
      ],
    },
    {
      code: 'TEA02',
      name: 'Trà vải hoa hồng thanh mát',
      categoryId: catTea.id,
      description: 'Trà lài kết hợp siro vải ngọt dịu và cánh hoa hồng thoang thoảng.',
      allowedToppings: ['TOP01', 'TOP03'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 39000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 120 }, { ingCode: 'ING_SYRUP_LYCHEE', qty: 25 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 45000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 150 }, { ingCode: 'ING_SYRUP_LYCHEE', qty: 30 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 52000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 200 }, { ingCode: 'ING_SYRUP_LYCHEE', qty: 40 }] },
      ],
    },
    {
      code: 'TEA03',
      name: 'Trà sen vàng macchiato',
      categoryId: catTea.id,
      description: 'Trà Ô long thượng hạng với hạt sen bùi bùi và lớp kem cheese béo ngậy.',
      allowedToppings: ['TOP04', 'TOP05'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 42000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 120 }, { ingCode: 'ING_CHEESE_CREAM', qty: 25 }, { ingCode: 'ING_LOTUS_SEED', qty: 30 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 48000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 150 }, { ingCode: 'ING_CHEESE_CREAM', qty: 30 }, { ingCode: 'ING_LOTUS_SEED', qty: 40 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 55000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 200 }, { ingCode: 'ING_CHEESE_CREAM', qty: 40 }, { ingCode: 'ING_LOTUS_SEED', qty: 60 }] },
      ],
    },
    {
      code: 'TEA04',
      name: 'Trà lài đác thơm mát',
      categoryId: catTea.id,
      description: 'Cốt trà hoa lài ướp hương thơm ngát sảng khoái.',
      allowedToppings: ['TOP03'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 39000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 120 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 45000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 150 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 52000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 200 }] },
      ],
    },
    {
      code: 'TEA05',
      name: 'Trà ô long thanh yên mật ong',
      categoryId: catTea.id,
      description: 'Trà ô long ủ mộc quyện cùng vị ngọt dịu của mật ong tự nhiên.',
      allowedToppings: ['TOP04'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 39000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 120 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 45000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 150 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 52000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 200 }] },
      ],
    },
    {
      code: 'TEA06',
      name: 'Trà dâu tằm tuyết mát lạnh',
      categoryId: catTea.id,
      description: 'Trà lài hoa thơm quyện vị chua ngọt đặc trưng của quả dâu tằm Đà Lạt.',
      allowedToppings: ['TOP03', 'TOP04'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 42000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 120 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 48000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 150 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 55000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 200 }] },
      ],
    },
    {
      code: 'TEA07',
      name: 'Trà ổi hồng chanh dây nhiệt đới',
      categoryId: catTea.id,
      description: 'Sự hòa quyện tuyệt vời của ổi hồng thơm ngát và vị chua thanh mát chanh dây.',
      allowedToppings: ['TOP03'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 39000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 120 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 45000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 150 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 52000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 200 }] },
      ],
    },

    // NHÓM 3: TRÀ SỮA & ĐÁ XAY (6 món)
    {
      code: 'MLK01',
      name: 'Trà sữa Ô long nướng trân châu',
      categoryId: catMilkTea.id,
      description: 'Trà Ô long nướng đậm hương khói kết hợp sữa béo ngậy và trân châu dẻo.',
      allowedToppings: ['TOP01', 'TOP04'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 39000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 100 }, { ingCode: 'ING_CONDENSED_MILK', qty: 25 }, { ingCode: 'ING_FRESH_MILK', qty: 40 }, { ingCode: 'ING_PEARL_RAW', qty: 30 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 46000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 120 }, { ingCode: 'ING_CONDENSED_MILK', qty: 35 }, { ingCode: 'ING_FRESH_MILK', qty: 50 }, { ingCode: 'ING_PEARL_RAW', qty: 40 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 53000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_OOLONG', qty: 160 }, { ingCode: 'ING_CONDENSED_MILK', qty: 45 }, { ingCode: 'ING_FRESH_MILK', qty: 70 }, { ingCode: 'ING_PEARL_RAW', qty: 60 }] },
      ],
    },
    {
      code: 'MLK02',
      name: 'Trà sữa Lài sữa tươi kem cheese',
      categoryId: catMilkTea.id,
      description: 'Trà hoa lài thanh mát hòa quyện cùng sữa tươi Dalat Milk và váng phô mai.',
      allowedToppings: ['TOP01', 'TOP04'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 42000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 100 }, { ingCode: 'ING_FRESH_MILK', qty: 50 }, { ingCode: 'ING_CONDENSED_MILK', qty: 25 }, { ingCode: 'ING_CHEESE_CREAM', qty: 25 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 49000n, isDefault: true, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 120 }, { ingCode: 'ING_FRESH_MILK', qty: 70 }, { ingCode: 'ING_CONDENSED_MILK', qty: 35 }, { ingCode: 'ING_CHEESE_CREAM', qty: 35 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 56000n, isDefault: false, recipe: [{ ingCode: 'ING_TEA_JASMINE', qty: 160 }, { ingCode: 'ING_FRESH_MILK', qty: 90 }, { ingCode: 'ING_CONDENSED_MILK', qty: 45 }, { ingCode: 'ING_CHEESE_CREAM', qty: 45 }] },
      ],
    },
    {
      code: 'MLK03',
      name: 'Matcha Latte Nhật Bản',
      categoryId: catMilkTea.id,
      description: 'Bột trà xanh Uji Matcha cao cấp khuấy cùng sữa tươi thanh trùng ngọt dịu.',
      allowedToppings: ['TOP01', 'TOP04'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 42000n, isDefault: false, recipe: [{ ingCode: 'ING_MATCHA_POWDER', qty: 10 }, { ingCode: 'ING_FRESH_MILK', qty: 120 }, { ingCode: 'ING_CONDENSED_MILK', qty: 20 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 49000n, isDefault: true, recipe: [{ ingCode: 'ING_MATCHA_POWDER', qty: 15 }, { ingCode: 'ING_FRESH_MILK', qty: 150 }, { ingCode: 'ING_CONDENSED_MILK', qty: 30 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 56000n, isDefault: false, recipe: [{ ingCode: 'ING_MATCHA_POWDER', qty: 20 }, { ingCode: 'ING_FRESH_MILK', qty: 200 }, { ingCode: 'ING_CONDENSED_MILK', qty: 40 }] },
      ],
    },
    {
      code: 'FRZ01',
      name: 'Freeze Trà xanh Matcha đá xay',
      categoryId: catMilkTea.id,
      description: 'Matcha đá xay mát lạnh, kèm lớp thạch cà phê giòn dai và kem béo.',
      allowedToppings: ['TOP01', 'TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 49000n, isDefault: false, recipe: [{ ingCode: 'ING_MATCHA_POWDER', qty: 12 }, { ingCode: 'ING_FRESH_MILK', qty: 80 }, { ingCode: 'ING_CONDENSED_MILK', qty: 20 }, { ingCode: 'ING_CHEESE_CREAM', qty: 25 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 56000n, isDefault: true, recipe: [{ ingCode: 'ING_MATCHA_POWDER', qty: 15 }, { ingCode: 'ING_FRESH_MILK', qty: 100 }, { ingCode: 'ING_CONDENSED_MILK', qty: 25 }, { ingCode: 'ING_CHEESE_CREAM', qty: 30 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 63000n, isDefault: false, recipe: [{ ingCode: 'ING_MATCHA_POWDER', qty: 20 }, { ingCode: 'ING_FRESH_MILK', qty: 140 }, { ingCode: 'ING_CONDENSED_MILK', qty: 35 }, { ingCode: 'ING_CHEESE_CREAM', qty: 40 }] },
      ],
    },
    {
      code: 'FRZ02',
      name: 'Freeze Cà phê Caramel đá xay',
      categoryId: catMilkTea.id,
      description: 'Cà phê Robusta đá xay cùng sốt caramel béo ngọt và chóp kem bông tuyết.',
      allowedToppings: ['TOP01', 'TOP02'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 49000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 15 }, { ingCode: 'ING_FRESH_MILK', qty: 60 }, { ingCode: 'ING_SYRUP_CARAMEL', qty: 20 }, { ingCode: 'ING_CHEESE_CREAM', qty: 25 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 56000n, isDefault: true, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 20 }, { ingCode: 'ING_FRESH_MILK', qty: 80 }, { ingCode: 'ING_SYRUP_CARAMEL', qty: 25 }, { ingCode: 'ING_CHEESE_CREAM', qty: 30 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 63000n, isDefault: false, recipe: [{ ingCode: 'ING_COFFEE_ROBUSTA', qty: 30 }, { ingCode: 'ING_FRESH_MILK', qty: 110 }, { ingCode: 'ING_SYRUP_CARAMEL', qty: 35 }, { ingCode: 'ING_CHEESE_CREAM', qty: 40 }] },
      ],
    },
    {
      code: 'FRZ03',
      name: 'Cacao đá xay bánh quy kem',
      categoryId: catMilkTea.id,
      description: 'Bột cacao nguyên chất xay mịn cùng sữa tươi và vụn bánh quy thơm lừng.',
      allowedToppings: ['TOP01', 'TOP04'],
      variants: [
        { code: 'S', sizeLabel: 'S', priceVnd: 49000n, isDefault: false, recipe: [{ ingCode: 'ING_COCOA_POWDER', qty: 15 }, { ingCode: 'ING_FRESH_MILK', qty: 80 }, { ingCode: 'ING_CONDENSED_MILK', qty: 25 }, { ingCode: 'ING_CHEESE_CREAM', qty: 25 }] },
        { code: 'M', sizeLabel: 'M', priceVnd: 56000n, isDefault: true, recipe: [{ ingCode: 'ING_COCOA_POWDER', qty: 20 }, { ingCode: 'ING_FRESH_MILK', qty: 100 }, { ingCode: 'ING_CONDENSED_MILK', qty: 30 }, { ingCode: 'ING_CHEESE_CREAM', qty: 30 }] },
        { code: 'L', sizeLabel: 'L', priceVnd: 63000n, isDefault: false, recipe: [{ ingCode: 'ING_COCOA_POWDER', qty: 25 }, { ingCode: 'ING_FRESH_MILK', qty: 140 }, { ingCode: 'ING_CONDENSED_MILK', qty: 40 }, { ingCode: 'ING_CHEESE_CREAM', qty: 40 }] },
      ],
    },

    // NHÓM 4: BÁNH & MÓN ĂN KÈM (6 món)
    {
      code: 'BAK01',
      name: 'Bánh sừng bò Croissant bơ',
      categoryId: catBakery.id,
      description: 'Bánh sừng bò nướng lò thơm lừng mùi bơ Pháp, giòn rụm bên ngoài, mềm bên trong.',
      allowedToppings: [],
      variants: [
        { code: 'ONE', sizeLabel: 'Cái', priceVnd: 35000n, isDefault: true, recipe: [{ ingCode: 'ING_CROISSANT_DOUGH', qty: 1 }] },
      ],
    },
    {
      code: 'BAK02',
      name: 'Bánh Mousse Tiramisu mềm mịn',
      categoryId: catBakery.id,
      description: 'Bánh tráng miệng hương vị cà phê và rượu nhẹ quyện cùng phô mai Mascarpone.',
      allowedToppings: [],
      variants: [
        { code: 'ONE', sizeLabel: 'Phần', priceVnd: 45000n, isDefault: true, recipe: [{ ingCode: 'ING_TIRAMISU_CAKE', qty: 1 }] },
      ],
    },
    {
      code: 'BAK03',
      name: 'Bánh phô mai nướng Basque',
      categoryId: catBakery.id,
      description: 'Bánh phô mai cháy bề mặt thơm ngậy, tan chảy trong miệng.',
      allowedToppings: [],
      variants: [
        { code: 'ONE', sizeLabel: 'Phần', priceVnd: 48000n, isDefault: true, recipe: [{ ingCode: 'ING_CHEESECAKE', qty: 1 }] },
      ],
    },
    {
      code: 'BAK04',
      name: 'Bánh mì que phô mai cay',
      categoryId: catBakery.id,
      description: 'Bánh mì que giòn tan nhân pate và phô mai cay kích thích vị giác.',
      allowedToppings: [],
      variants: [
        { code: 'ONE', sizeLabel: 'Cái', priceVnd: 22000n, isDefault: true, recipe: [{ ingCode: 'ING_CROISSANT_DOUGH', qty: 1 }] },
      ],
    },
    {
      code: 'EXT01',
      name: 'Chén trân châu đen ăn riêng',
      categoryId: catBakery.id,
      description: 'Một chén trân châu đen nấu đường đen dẻo dai ăn kèm riêng.',
      allowedToppings: [],
      variants: [
        { code: 'ONE', sizeLabel: 'Chén', priceVnd: 12000n, isDefault: true, recipe: [{ ingCode: 'ING_PEARL_RAW', qty: 50 }] },
      ],
    },
    {
      code: 'EXT02',
      name: 'Chén kem cheese ăn riêng',
      categoryId: catBakery.id,
      description: 'Một chén váng sữa kem phô mai béo mặn thơm ngậy ăn kèm riêng.',
      allowedToppings: [],
      variants: [
        { code: 'ONE', sizeLabel: 'Chén', priceVnd: 15000n, isDefault: true, recipe: [{ ingCode: 'ING_CHEESE_CREAM', qty: 50 }] },
      ],
    },
  ];

  for (const p of productsList) {
    const product = await prisma.product.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        categoryId: p.categoryId,
        description: p.description,
        isActive: true,
      },
      create: {
        code: p.code,
        name: p.name,
        categoryId: p.categoryId,
        description: p.description,
        isActive: true,
      },
    });

    // Gán Topping được phép
    for (const topCode of p.allowedToppings) {
      const topping = toppingMap.get(topCode);
      if (topping) {
        await prisma.productTopping.upsert({
          where: { productId_toppingId: { productId: product.id, toppingId: topping.id } },
          update: {},
          create: { productId: product.id, toppingId: topping.id },
        });
      }
    }

    // Tạo Biến thể Size & Công thức (Recipe)
    for (const v of p.variants) {
      const variant = await prisma.productVariant.upsert({
        where: { productId_code: { productId: product.id, code: v.code } },
        update: {
          sizeLabel: v.sizeLabel,
          priceVnd: v.priceVnd,
          isDefault: v.isDefault,
          isActive: true,
        },
        create: {
          productId: product.id,
          code: v.code,
          sizeLabel: v.sizeLabel,
          priceVnd: v.priceVnd,
          isDefault: v.isDefault,
          isActive: true,
        },
      });

      // Tạo RecipeVersion 1 ACTIVE
      const recipeVersion = await prisma.recipeVersion.upsert({
        where: { productVariantId_versionNo: { productVariantId: variant.id, versionNo: 1 } },
        update: { status: 'ACTIVE' },
        create: { productVariantId: variant.id, versionNo: 1, status: 'ACTIVE' },
      });

      // Tạo RecipeItems
      for (const r of v.recipe) {
        const ing = ingredientMap.get(r.ingCode);
        if (ing) {
          await prisma.recipeItem.upsert({
            where: { recipeVersionId_ingredientId: { recipeVersionId: recipeVersion.id, ingredientId: ing.id } },
            update: { quantity: r.qty },
            create: { recipeVersionId: recipeVersion.id, ingredientId: ing.id, quantity: r.qty },
          });
        }
      }
    }
  }

  // 7. SỐ DƯ TỒN KHO BAN ĐẦU CHO CẢ 2 CHI NHÁNH
  console.log('🏬 Khởi tạo số dư tồn kho dồi dào cho Store 1 và Store 2...');
  const storeList = [store1, store2];
  for (const st of storeList) {
    for (const [code, ing] of ingredientMap.entries()) {
      let initQty = 10000;
      if (code.includes('COFFEE')) initQty = 15000;
      if (code.includes('MILK')) initQty = 20000;
      if (code.includes('TEA')) initQty = 25000;
      if (code.includes('DOUGH') || code.includes('CAKE')) initQty = 50;

      await prisma.stockBalance.upsert({
        where: { storeId_ingredientId: { storeId: st.id, ingredientId: ing.id } },
        update: { quantity: initQty },
        create: { storeId: st.id, ingredientId: ing.id, quantity: initQty },
      });
    }
  }

  // 8. GHI NHẬN SYNC CHANGES ĐỂ POS ĐỒNG BỘ MỚI NHẤT
  console.log('🔄 Ghi nhận biến động sync_changes cho máy POS kéo delta...');
  await prisma.syncChange.create({
    data: {
      storeId: null,
      entityType: 'catalog_bootstrap',
      entityId: 'full_update',
      changeType: 'UPSERT',
      payload: { message: 'Master catalog 28 products updated' },
    },
  });

  console.log('✅ Hoàn tất nạp Master Catalog thành công rực rỡ!');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi nạp Master Catalog:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
