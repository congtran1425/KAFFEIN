import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CryptoUtil } from '../src/common/security/crypto.util';
import { PrismaService } from '../src/database/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';

describe('Sync & Sales Integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storeId: bigint;
  let deviceId: string;
  let rawCredential: string;
  let deviceAuthHeader: string;
  let employeeId: bigint;
  let employeeCode: string;
  let productId: bigint;
  let variantId: bigint;
  let ingredientId: bigint;

  beforeAll(async () => {
    process.env.ZALOPAY_APP_ID = '2553';
    process.env.ZALOPAY_KEY1 = 'integration-test-key-1';
    process.env.ZALOPAY_KEY2 = 'integration-test-key-2';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // 1. Tạo Store thử nghiệm
    const store = await prisma.store.create({
      data: {
        code: `TEST-SYNC-${randomUUID().slice(0, 8)}`,
        name: 'Chi nhánh Test Sync',
        address: '123 Đường Test, Quận 1',
      },
    });
    storeId = store.id;

    // 2. Tạo Device và Credential
    deviceId = randomUUID();
    rawCredential = `test-cred-${randomUUID()}`;
    const credentialHash = CryptoUtil.sha256(rawCredential);
    deviceAuthHeader = `Device ${rawCredential}`;

    await prisma.device.create({
      data: {
        id: deviceId,
        storeId,
        displayName: 'POS Máy 1',
        status: 'ACTIVE',
        credentialHash,
        lastHeartbeatAt: new Date(),
      },
    });

    // 3. Tạo Employee thuộc chi nhánh với PIN 1234
    const pinHash = await CryptoUtil.hashPin('1234');
    const employee = await prisma.user.create({
      data: {
        homeStoreId: storeId,
        fullName: 'Nguyễn Thu Ngân E2E',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        pinCredential: {
          create: {
            pinHash,
            pinVersion: 1,
          },
        },
      },
    });
    employeeId = employee.id;
    const dbEmployee = await prisma.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    employeeCode = dbEmployee.employeeCode.toString();

    // 4. Tạo Danh mục, Sản phẩm, Biến thể, Nguyên liệu, Công thức và Tồn kho ban đầu
    const category = await prisma.productCategory.create({
      data: {
        name: `Cà phê E2E ${randomUUID().slice(0, 8)}`,
        sortOrder: 1,
        taxRateBps: 1000, // 10%
      },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: `PROD-${randomUUID().slice(0, 6)}`,
        name: 'Cà phê Sữa Đá E2E',
      },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        code: 'M',
        sizeLabel: 'M',
        priceVnd: 35000n,
        isDefault: true,
      },
    });
    variantId = variant.id;

    const ingredient = await prisma.ingredient.create({
      data: {
        code: `ING-${randomUUID().slice(0, 6)}`,
        name: `Hạt cà phê Test ${randomUUID().slice(0, 8)}`,
        baseUnit: 'G',
      },
    });
    ingredientId = ingredient.id;

    // Tồn kho ban đầu: 1000g
    await prisma.stockBalance.create({
      data: {
        storeId,
        ingredientId,
        quantity: 1000,
        version: 1n,
      },
    });

    // Công thức: 1 ly M tiêu hao 20g
    const recipe = await prisma.recipeVersion.create({
      data: {
        productVariantId: variant.id,
        versionNo: 1,
        status: 'ACTIVE',
      },
    });

    await prisma.recipeItem.create({
      data: {
        recipeVersionId: recipe.id,
        ingredientId,
        quantity: 20,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Cashier logs in -> persists active cashier session', async () => {
    const res = await request(app.getHttpServer())
      .post('/cashier-sessions:login')
      .set('Authorization', deviceAuthHeader)
      .send({
        employeeCode,
        pin: '1234',
      });

    expect(res.status).toBe(200);
    expect(res.body.storeId).toBe(storeId.toString());
    expect(res.body.sessionId).toBeDefined();

    // Kiểm tra Database: có CashierSession ACTIVE trên thiết bị này
    const dbSession = await prisma.cashierSession.findFirst({
      where: { deviceId, status: 'ACTIVE' },
    });
    expect(dbSession).toBeDefined();
    expect(dbSession?.userId).toBe(employeeId);
  });

  it('2. Open Register Session -> verifies session belongs to device and store', async () => {
    const regSessionId = randomUUID();
    const res = await request(app.getHttpServer())
      .post('/register-sessions')
      .set('Authorization', deviceAuthHeader)
      .send({
        id: regSessionId,
        openingCashVnd: 500000,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(regSessionId);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.openingCashVnd).toBe('500000');
  });

  it('3. Push CASH_SALE_COMPLETED -> creates sale PAID, deduces inventory atomically in same tx', async () => {
    const regSession = await prisma.registerSession.findFirst({
      where: { deviceId, status: 'OPEN' },
    });
    expect(regSession).toBeDefined();

    const saleId = randomUUID();
    const operationId = randomUUID();

    const pushRes = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId,
            type: 'CASH_SALE_COMPLETED',
            payload: {
              id: saleId,
              registerSessionId: regSession!.id,
              items: [
                {
                  productId: '1', // Sẽ được match qua variant
                  productVariantId: variantId.toString(),
                  quantity: 2,
                },
              ],
              payment: {
                method: 'CASH',
                amountVnd: 70000,
              },
            },
          },
        ],
      });

    expect(pushRes.status).toBe(200);
    expect(pushRes.body.processed).toHaveLength(1);
    expect(pushRes.body.processed[0].status).toBe('COMPLETED');

    // 1. Kiểm tra sync_operations đã lưu
    const op = await prisma.syncOperation.findUnique({
      where: { operationId },
    });
    expect(op).toBeDefined();
    expect(op?.status).toBe('COMPLETED');

    // 2. Kiểm tra Sale và Payment
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    expect(sale).toBeDefined();
    expect(sale?.status).toBe('PAID');
    expect(sale?.cashierUserId).toBe(employeeId); // Lấy từ cashier session!
    expect(sale?.payments[0].status).toBe('PAID');

    // 3. Kiểm tra Tồn kho đã trừ: 1000g - (2 ly * 20g) = 960g
    const balance = await prisma.stockBalance.findUnique({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
    expect(Number(balance?.quantity)).toBe(960);

    // 4. Idempotency test: Gửi lại chính tác vụ này -> trả về ALREADY_PROCESSED không trừ kho lần 2!
    const dupRes = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId,
            type: 'CASH_SALE_COMPLETED',
            payload: {
              id: saleId,
              registerSessionId: regSession!.id,
              items: [
                {
                  productId: '1',
                  productVariantId: variantId.toString(),
                  quantity: 2,
                },
              ],
              payment: { method: 'CASH', amountVnd: 70000 },
            },
          },
        ],
      });

    expect(dupRes.body.processed[0].status).toBe('ALREADY_PROCESSED');
    const balanceAfterDup = await prisma.stockBalance.findUnique({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
    expect(Number(balanceAfterDup?.quantity)).toBe(960); // Vẫn là 960g
  });

  it('4. ZaloPay Sale -> initially PAYMENT_PENDING without stock deduction, then webhook confirms and deducts', async () => {
    const saleId = randomUUID();
    const merchantOrderId = `ZP-${randomUUID().slice(0, 10)}`;

    // Tạo đơn ZaloPay trực tiếp qua API Sales
    const saleRes = await request(app.getHttpServer())
      .post('/sales')
      .set('Authorization', deviceAuthHeader)
      .send({
        id: saleId,
        items: [
          {
            productId: productId.toString(),
            productVariantId: variantId.toString(),
            quantity: 1,
          },
        ],
        payment: {
          method: 'ZALOPAY',
          amountVnd: 35000,
          merchantOrderId,
        },
      });

    expect(saleRes.status).toBe(201);
    expect(saleRes.body.status).toBe('PAYMENT_PENDING');

    // Tồn kho chưa được trừ! (Vẫn là 960g)
    let balance = await prisma.stockBalance.findUnique({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
    expect(Number(balance?.quantity)).toBe(960);

    // Gửi Webhook callback từ ZaloPay
    const webhookData = JSON.stringify({
      app_id: 2553,
      app_trans_id: merchantOrderId,
      zp_trans_id: 99887766,
      amount: 35000,
    });
    const mac = CryptoUtil.hmacSha256(process.env.ZALOPAY_KEY2!, webhookData);

    const hookRes = await request(app.getHttpServer())
      .post('/webhooks/zalopay')
      .send({ data: webhookData, mac });

    expect(hookRes.status).toBe(200);
    expect(hookRes.body.return_code).toBe(1);

    // Kiểm tra Sale và Payment đã chuyển sang PAID
    const updatedSale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    expect(updatedSale?.status).toBe('PAID');
    expect(updatedSale?.payments[0].status).toBe('PAID');

    // Bây giờ kho mới bị trừ 20g: 960g - 20g = 940g!
    balance = await prisma.stockBalance.findUnique({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
    expect(Number(balance?.quantity)).toBe(940);
  });

  it('5. Pull Changes (Cold Sync cursor=0) -> snapshot does NOT leak employee pinHash and includes ingredients, recipes, stock', async () => {
    const res = await request(app.getHttpServer())
      .get('/sync/changes?cursor=0')
      .set('Authorization', deviceAuthHeader);

    expect(res.status).toBe(200);
    expect(res.body.changes.length).toBeGreaterThan(0);
    const empChange = res.body.changes.find(
      (c: any) => c.entityType === 'employees',
    );
    expect(empChange).toBeDefined();
    expect(empChange.payload.fullName).toBe('Nguyễn Thu Ngân E2E');
    expect(empChange.payload.pinHash).toBeUndefined();

    // Kiểm tra đủ nguyên liệu, công thức và tồn kho cho POS offline
    const ingChange = res.body.changes.find(
      (c: any) => c.entityType === 'ingredients',
    );
    expect(ingChange).toBeDefined();

    const recipeChange = res.body.changes.find(
      (c: any) => c.entityType === 'recipes',
    );
    expect(recipeChange).toBeDefined();

    const stockChange = res.body.changes.find(
      (c: any) => c.entityType === 'stock_balances',
    );
    expect(stockChange).toBeDefined();
  });

  it('6. Concurrent push with identical operationId -> idempotent success without race conditions', async () => {
    const concurrentOpId = randomUUID();
    const saleId = randomUUID();
    const saleNumber = `ORD-CONC-${Date.now().toString().slice(-4)}`;

    const payload = {
      id: saleId,
      saleNumber,
      cashierCode: employeeCode,
      items: [
        {
          productId: productId.toString(),
          productVariantId: variantId.toString(),
          quantity: 1,
        },
      ],
      payment: {
        method: 'CASH',
        amountVnd: 35000,
      },
    };

    const pushBody = {
      operations: [
        {
          operationId: concurrentOpId,
          type: 'CASH_SALE_COMPLETED',
          payload,
        },
      ],
    };

    // Gửi đồng thời hai requests với cùng operationId
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/sync/operations')
        .set('Authorization', deviceAuthHeader)
        .send(pushBody),
      request(app.getHttpServer())
        .post('/sync/operations')
        .set('Authorization', deviceAuthHeader)
        .send(pushBody),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const r1Status = res1.body.processed[0]?.status;
    const r2Status = res2.body.processed[0]?.status;

    // Một request hoàn tất, request còn lại nhận ALREADY_PROCESSED
    const statuses = [r1Status, r2Status].sort();
    expect(statuses).toEqual(['ALREADY_PROCESSED', 'COMPLETED']);
  });

  it('7. Cross-device operationId collision -> rejected with 409 Conflict', async () => {
    // Tạo Store 2 và Device 2
    const store2 = await prisma.store.create({
      data: {
        code: `TEST-STORE2-${randomUUID().slice(0, 8)}`,
        name: 'Chi nhánh Test 2',
        address: '456 Đường Test, Quận 3',
      },
    });
    const device2Id = randomUUID();
    const rawCred2 = `test-cred2-${randomUUID()}`;
    await prisma.device.create({
      data: {
        id: device2Id,
        storeId: store2.id,
        displayName: 'POS Máy 2 Store 2',
        status: 'ACTIVE',
        credentialHash: CryptoUtil.sha256(rawCred2),
      },
    });

    const sharedOpId = randomUUID();
    const payload = {
      id: randomUUID(),
      saleNumber: `ORD-CR-${Date.now().toString().slice(-4)}`,
      cashierCode: employeeCode,
      items: [
        {
          productId: productId.toString(),
          productVariantId: variantId.toString(),
          quantity: 1,
        },
      ],
      payment: {
        method: 'CASH',
        amountVnd: 35000,
      },
    };

    // Device 1 đẩy operation trước
    const resDev1 = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: sharedOpId,
            type: 'CASH_SALE_COMPLETED',
            payload,
          },
        ],
      });
    expect(resDev1.status).toBe(200);
    expect(resDev1.body.processed[0].status).toBe('COMPLETED');

    // Device 2 dùng lại chính operationId này -> phải bị từ chối 409 OPERATION_DEVICE_COLLISION!
    const resDev2 = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', `Device ${rawCred2}`)
      .send({
        operations: [
          {
            operationId: sharedOpId,
            type: 'CASH_SALE_COMPLETED',
            payload,
          },
        ],
      });

    expect(resDev2.status).toBe(200);
    expect(resDev2.body.errors[0]?.error).toContain(
      '409 OPERATION_DEVICE_COLLISION',
    );
  });

  it('8. POS sync outbox attempting STOCK_ADJUSTED -> rejected with Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'STOCK_ADJUSTED',
            payload: {
              ingredientId: ingredientId.toString(),
              changeQuantity: 100,
              reason: 'POS hacked adjustment',
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.errors[0]?.error).toContain('Thiết bị POS không có quyền');
  });

  it('9. Web Principal JWT authentication & spoofing rejection', async () => {
    const jwtSecret =
      process.env.JWT_ACCESS_SECRET ||
      'local-development-access-secret-change-before-deploy';

    // 9a. Gửi x-user-id giả mạo không có Bearer token -> Bị từ chối 401
    const spoofRes = await request(app.getHttpServer())
      .post('/device-activations')
      .set('x-user-id', '1')
      .send({
        storeId: storeId.toString(),
      });
    expect(spoofRes.status).toBe(401);

    // 9b. Owner may activate only a store without an ACTIVE POS.
    const ownerUser = await prisma.user.upsert({
      where: { employeeCode: 1000001n },
      create: {
        fullName: 'Chủ chuỗi Cafe Test',
        role: 'OWNER',
        status: 'ACTIVE',
      },
      update: {},
    });
    const ownerToken = CryptoUtil.signJwt(
      { userId: ownerUser.id.toString(), role: 'OWNER' },
      jwtSecret,
      3600,
    );
    const alreadyActiveRes = await request(app.getHttpServer())
      .post('/device-activations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        storeId: storeId.toString(),
      });
    expect(alreadyActiveRes.status).toBe(409);
    const enrollmentStore = await prisma.store.create({
      data: {
        code: `ACTIVATION-${randomUUID().slice(0, 8)}`,
        name: 'Activation sandbox',
        address: 'Test only',
      },
    });
    const validRes = await request(app.getHttpServer())
      .post('/device-activations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ storeId: enrollmentStore.id.toString() });
    expect(validRes.status).toBe(201);
    expect(validRes.body.activationCode).toBeDefined();

    // 9c. Thiết bị POS gọi API điều chỉnh kho -> Bị từ chối 403 Forbidden
    const posAdjustRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/stock-adjustments`)
      .set('Authorization', deviceAuthHeader)
      .send({
        movementType: 'RECEIPT',
        items: [
          {
            ingredientId: ingredientId.toString(),
            quantityDelta: 50,
          },
        ],
        reason: 'POS điều chỉnh kho',
      });
    expect(posAdjustRes.status).toBe(403);

    // 9d. Quản lý STORE_MANAGER điều chỉnh kho đúng chi nhánh của mình -> Thành công 200
    const smUser = await prisma.user.create({
      data: {
        homeStoreId: storeId,
        fullName: 'Quản lý Store 1',
        role: 'STORE_MANAGER',
        status: 'ACTIVE',
      },
    });
    const smToken = CryptoUtil.signJwt(
      {
        userId: smUser.id.toString(),
        role: 'STORE_MANAGER',
        homeStoreId: storeId.toString(),
      },
      jwtSecret,
      3600,
    );
    // 9d-1. Khi máy POS chi nhánh offline (> 90 giây) -> Bị từ chối 400 Bad Request
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastHeartbeatAt: new Date(Date.now() - 120_000) },
    });
    const offlineAdjustRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/stock-adjustments`)
      .set('Authorization', `Bearer ${smToken}`)
      .send({
        movementType: 'RECEIPT',
        items: [
          {
            ingredientId: ingredientId.toString(),
            quantityDelta: 50,
          },
        ],
        reason: 'Nhập kho khi POS offline',
      });
    expect(offlineAdjustRes.status).toBe(400);

    await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastHeartbeatAt: new Date(),
        lastSyncedAt: new Date(),
        hasPendingOutbox: false,
        outboxPendingCount: 0,
      },
    });
    const adjustRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/stock-adjustments`)
      .set('Authorization', `Bearer ${smToken}`)
      .send({
        movementType: 'RECEIPT',
        items: [
          {
            ingredientId: ingredientId.toString(),
            quantityDelta: 50,
          },
        ],
        reason: 'Nhập kho bổ sung đầu ca',
      });
    expect(adjustRes.status).toBe(200);

    // 9e. Quản lý STORE_MANAGER thao tác chi nhánh khác -> Bị từ chối 403 Forbidden
    const foreignManager = await prisma.user.create({
      data: {
        fullName: 'Foreign SM sandbox',
        role: 'STORE_MANAGER',
        homeStoreId: enrollmentStore.id,
      },
    });
    const foreignSmToken = CryptoUtil.signJwt(
      {
        userId: foreignManager.id.toString(),
        role: 'STORE_MANAGER',
        homeStoreId: enrollmentStore.id.toString(),
      },
      jwtSecret,
      3600,
    );
    const foreignRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/stock-adjustments`)
      .set('Authorization', `Bearer ${foreignSmToken}`)
      .send({
        movementType: 'RECEIPT',
        items: [
          {
            ingredientId: ingredientId.toString(),
            quantityDelta: 50,
          },
        ],
        reason: 'Hack kho store khác',
      });
    expect(foreignRes.status).toBe(403);
  });

  it('10. Sale payload with string product code & Android demo IDs -> resolves successfully', async () => {
    const saleId = randomUUID();
    const productRecord = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });

    const res = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'CASH_SALE_COMPLETED',
            payload: {
              id: saleId,
              saleNumber: `ORD-STR-${Date.now().toString().slice(-4)}`,
              cashierCode: employeeCode,
              items: [
                {
                  // Sử dụng format Android POS với ID giả lập "p1" và code thật
                  product: {
                    id: 'p1',
                    code: productRecord.code,
                    name: productRecord.name,
                  },
                  size: 'SIZE_M',
                  quantity: 2,
                },
              ],
              payment: {
                method: 'CASH',
                amountVnd: 70000,
              },
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.processed[0]?.status).toBe('COMPLETED');
    expect(res.body.processed[0]?.result.id).toBe(saleId);
  });

  it('11. Delta Sync (cursor > 0) -> pulls product deactivation event', async () => {
    // 11a. Lấy checkpoint cursor hiện tại của POS
    const bootstrapRes = await request(app.getHttpServer())
      .get('/sync/changes?cursor=0')
      .set('Authorization', deviceAuthHeader);
    const lastCursor = bootstrapRes.body.nextCursor;

    // 11b. Web Owner ẩn một sản phẩm
    const owner = await prisma.user.findFirstOrThrow({
      where: { role: 'OWNER', status: 'ACTIVE' },
    });
    const ownerToken = CryptoUtil.signJwt(
      { userId: owner.id.toString(), role: 'OWNER' },
      process.env.JWT_ACCESS_SECRET ||
        'local-development-access-secret-change-before-deploy',
      3600,
    );

    const patchRes = await request(app.getHttpServer())
      .patch(`/products/${productId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isActive: false });
    expect(patchRes.status).toBe(200);

    // 11c. POS gọi delta sync với cursor = lastCursor
    const deltaRes = await request(app.getHttpServer())
      .get(`/sync/changes?cursor=${lastCursor}`)
      .set('Authorization', deviceAuthHeader);

    expect(deltaRes.status).toBe(200);
    expect(deltaRes.body.changes.length).toBeGreaterThan(0);
    const deactivatedProductChange = deltaRes.body.changes.find(
      (c: any) =>
        c.entityType === 'products' && c.entityId === productId.toString(),
    );
    expect(deactivatedProductChange).toBeDefined();
    expect(deactivatedProductChange.changeType).toBe('UPSERT');
    expect(deactivatedProductChange.payload.isActive).toBe(false);
    expect(deactivatedProductChange.payload.categoryId).toBeDefined();
    expect(Array.isArray(deactivatedProductChange.payload.variants)).toBe(true);
    expect(
      Array.isArray(deactivatedProductChange.payload.allowedToppingIds),
    ).toBe(true);
  });

  it('12. Offline Register Session -> opens and closes using openedByCode/closedByCode when server cashier session is inactive', async () => {
    // Đảm bảo không còn cashier session nào ACTIVE trên device
    await prisma.cashierSession.updateMany({
      where: { deviceId, status: 'ACTIVE' },
      data: { status: 'CLOSED', endedAt: new Date() },
    });
    // Đảm bảo không còn register session nào OPEN trên device
    await prisma.registerSession.updateMany({
      where: { deviceId, status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    // Mở ca bằng openedByCode qua sync operation
    const regSessionId = randomUUID();
    const openRes = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'REGISTER_SESSION_OPENED',
            payload: {
              id: regSessionId,
              openingCashVnd: 300000,
              openedByCode: employeeCode,
              openedAt: new Date().toISOString(),
            },
          },
        ],
      });

    expect(openRes.status).toBe(200);
    expect(openRes.body.processed[0]?.status).toBe('COMPLETED');

    const dbReg = await prisma.registerSession.findUnique({
      where: { id: regSessionId },
    });
    expect(dbReg).toBeDefined();
    expect(dbReg?.status).toBe('OPEN');
    expect(dbReg?.openedByUserId).toBe(employeeId);

    // Đóng ca bằng closedByCode qua sync operation
    const closeRes = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'REGISTER_SESSION_CLOSED',
            payload: {
              sessionId: regSessionId,
              actualCashVnd: 300000,
              closedByCode: employeeCode,
              closedAt: new Date().toISOString(),
            },
          },
        ],
      });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.processed[0]?.status).toBe('COMPLETED');

    const dbClosedReg = await prisma.registerSession.findUnique({
      where: { id: regSessionId },
    });
    expect(dbClosedReg?.status).toBe('CLOSED');
    expect(dbClosedReg?.closedByUserId).toBe(employeeId);
  });

  it('13. Offline Cash Sale with recipeVersionId & consumption snapshot -> honors historical snapshot instead of server updated recipe', async () => {
    // 13a. Tạo một recipe version cũ V1 (15g) với trạng thái RETIRED (giả sử POS đã pull trước đó)
    const oldRecipeV1 = await prisma.recipeVersion.create({
      data: {
        productVariantId: variantId,
        versionNo: 99,
        status: 'RETIRED',
      },
    });
    await prisma.recipeItem.create({
      data: {
        recipeVersionId: oldRecipeV1.id,
        ingredientId,
        quantity: 15,
      },
    });

    // 13b. Đảm bảo có register session OPEN trên thiết bị
    const offlineRegSessionId = randomUUID();
    await prisma.registerSession.create({
      data: {
        id: offlineRegSessionId,
        deviceId,
        storeId,
        openedByUserId: employeeId,
        openingCashVnd: 200000,
        status: 'OPEN',
      },
    });

    // Lấy tồn kho trước khi bán
    const balanceBefore = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
    const qtyBefore = Number(balanceBefore.quantity);

    // 13c. POS đồng bộ đơn bán offline 2 ly, gửi kèm recipeVersionId = oldRecipeV1.id và snapshot consumptions
    const offlineSaleId = randomUUID();
    const pushRes = await request(app.getHttpServer())
      .post('/sync/operations')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'CASH_SALE_COMPLETED',
            payload: {
              id: offlineSaleId,
              saleNumber: `ORD-OFFLINE-${Date.now().toString().slice(-4)}`,
              cashierCode: employeeCode,
              registerSessionId: offlineRegSessionId,
              items: [
                {
                  productId: productId.toString(),
                  productVariantId: variantId.toString(),
                  recipeVersionId: oldRecipeV1.id.toString(),
                  quantity: 2,
                  consumptions: [
                    {
                      ingredientId: ingredientId.toString(),
                      quantityPerItem: 15,
                      quantityTotal: 30,
                    },
                  ],
                },
              ],
              payment: {
                method: 'CASH',
                amountVnd: 70000,
              },
            },
          },
        ],
      });

    expect(pushRes.status).toBe(200);
    expect(pushRes.body.processed[0]?.status).toBe('COMPLETED');

    // 13d. Kiểm tra số dư tồn kho: đúng 30g bị trừ (15g * 2), không bị tính theo công thức khác
    const balanceAfter = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
    expect(Number(balanceAfter.quantity)).toBe(qtyBefore - 30);

    // 13e. Kiểm tra sale_item_consumptions và recipeVersionId đã lưu đúng snapshot
    const saleItem = await prisma.saleItem.findFirstOrThrow({
      where: { saleId: offlineSaleId },
      include: { consumptions: true },
    });
    expect(saleItem.recipeVersionId).toBe(oldRecipeV1.id);
    expect(saleItem.consumptions.length).toBe(1);
    expect(Number(saleItem.consumptions[0].quantityTotal)).toBe(30);
    expect(Number(saleItem.consumptions[0].quantityPerItem)).toBe(15);
  });

  it('14. (Point 1) Web stock adjustment guard: rejected when store has no active device OR POS outbox is dirty', async () => {
    const jwtSecret =
      process.env.JWT_ACCESS_SECRET ||
      'local-development-access-secret-change-before-deploy';
    // 14a. Tạo một store mới hoàn toàn CHƯA có thiết bị POS nào
    const emptyStore = await prisma.store.create({
      data: {
        code: `NO-DEV-${randomUUID().slice(0, 8)}`,
        name: 'Chi nhánh Chưa Có Máy POS',
        address: '456 Đường Trống, Quận 3',
      },
    });
    const smEmptyUser = await prisma.user.create({
      data: {
        homeStoreId: emptyStore.id,
        fullName: 'Quản lý Empty Store',
        role: 'STORE_MANAGER',
        status: 'ACTIVE',
      },
    });
    const smTokenEmptyStore = CryptoUtil.signJwt(
      {
        userId: smEmptyUser.id.toString(),
        role: 'STORE_MANAGER',
        homeStoreId: emptyStore.id.toString(),
      },
      jwtSecret,
      3600,
    );
    const noDeviceRes = await request(app.getHttpServer())
      .post(`/stores/${emptyStore.id}/stock-adjustments`)
      .set('Authorization', `Bearer ${smTokenEmptyStore}`)
      .send({
        movementType: 'RECEIPT',
        items: [{ ingredientId: ingredientId.toString(), quantityDelta: 10 }],
        reason: 'Nhập kho chi nhánh chưa có máy',
      });
    expect(noDeviceRes.status).toBe(400);
    expect(noDeviceRes.body.message).toContain('chưa có thiết bị POS');

    // 14b. Tại chi nhánh storeId chính: Device có heartbeat mới nhưng có pending outbox (hasPendingOutbox: true)
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastHeartbeatAt: new Date(),
        hasPendingOutbox: true,
        outboxPendingCount: 2,
      },
    });
    const smMainUser = await prisma.user.create({
      data: {
        homeStoreId: storeId,
        fullName: 'Quản lý Main Store 14',
        role: 'STORE_MANAGER',
        status: 'ACTIVE',
      },
    });
    const smTokenMainStore = CryptoUtil.signJwt(
      {
        userId: smMainUser.id.toString(),
        role: 'STORE_MANAGER',
        homeStoreId: storeId.toString(),
      },
      jwtSecret,
      3600,
    );
    const dirtyOutboxRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/stock-adjustments`)
      .set('Authorization', `Bearer ${smTokenMainStore}`)
      .send({
        movementType: 'RECEIPT',
        items: [{ ingredientId: ingredientId.toString(), quantityDelta: 10 }],
        reason: 'Nhập kho khi POS còn pending outbox',
      });
    expect(dirtyOutboxRes.status).toBe(400);
    expect(dirtyOutboxRes.body.message).toContain('còn tác vụ chưa đồng bộ');

    // 14c. An empty batch cannot certify the device's entire queue is empty.
    await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', deviceAuthHeader)
      .send({ operations: [] });
    expect(
      (await prisma.device.findUniqueOrThrow({ where: { id: deviceId } }))
        .hasPendingOutbox,
    ).toBe(true);
    await request(app.getHttpServer())
      .post('/device/heartbeat')
      .set('Authorization', deviceAuthHeader)
      .send({ hasPendingOutbox: false, outboxPendingCount: 0 });

    const cleanRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/stock-adjustments`)
      .set('Authorization', `Bearer ${smTokenMainStore}`)
      .send({
        movementType: 'RECEIPT',
        items: [{ ingredientId: ingredientId.toString(), quantityDelta: 10 }],
        reason: 'Nhập kho sau khi POS sạch outbox',
      });
    expect(cleanRes.status).toBe(200);
  });

  it('15. (Point 2) POS consumptions validation: rejected when negative, mismatch line total, or unrelated ingredient', async () => {
    // 15a. POS gửi consumptions có quantityPerItem <= 0 -> REJECTED
    const negativeRes = await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'CASH_SALE_COMPLETED',
            payload: {
              cashierCode: employeeCode,
              items: [
                {
                  productId: productId.toString(),
                  productVariantId: variantId.toString(),
                  quantity: 1,
                  consumptions: [
                    {
                      ingredientId: ingredientId.toString(),
                      quantityPerItem: -10,
                      quantityTotal: -10,
                    },
                  ],
                },
              ],
              payment: { method: 'CASH', amountVnd: 35000 },
            },
          },
        ],
      });
    expect(negativeRes.status).toBe(200);
    expect(negativeRes.body.errors[0]?.status).toBe('REJECTED');
    expect(negativeRes.body.errors[0]?.error).toContain('phải lớn hơn 0');

    // 15b. POS gửi consumptions có quantityTotal không khớp quantityPerItem * quantity -> REJECTED
    const mismatchTotalRes = await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'CASH_SALE_COMPLETED',
            payload: {
              cashierCode: employeeCode,
              items: [
                {
                  productId: productId.toString(),
                  productVariantId: variantId.toString(),
                  quantity: 2,
                  consumptions: [
                    {
                      ingredientId: ingredientId.toString(),
                      quantityPerItem: 20,
                      quantityTotal: 99, // Lệch (đúng phải là 40)
                    },
                  ],
                },
              ],
              payment: { method: 'CASH', amountVnd: 70000 },
            },
          },
        ],
      });
    expect(mismatchTotalRes.status).toBe(200);
    expect(mismatchTotalRes.body.errors[0]?.status).toBe('REJECTED');
    expect(mismatchTotalRes.body.errors[0]?.error).toContain('không khớp');

    // 15c. POS gửi consumptions chứa nguyên liệu KHÔNG nằm trong công thức của món hoặc topping -> REJECTED
    const unrelatedIng = await prisma.ingredient.create({
      data: {
        code: `ING-UNRELATED-${randomUUID().slice(0, 6)}`,
        name: 'Nguyên liệu Lạ E2E',
        baseUnit: 'G',
      },
    });
    const unrelatedIngRes = await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'CASH_SALE_COMPLETED',
            payload: {
              cashierCode: employeeCode,
              items: [
                {
                  productId: productId.toString(),
                  productVariantId: variantId.toString(),
                  quantity: 1,
                  consumptions: [
                    {
                      ingredientId: unrelatedIng.id.toString(),
                      quantityPerItem: 10,
                      quantityTotal: 10,
                    },
                  ],
                },
              ],
              payment: { method: 'CASH', amountVnd: 35000 },
            },
          },
        ],
      });
    expect(unrelatedIngRes.status).toBe(200);
    expect(unrelatedIngRes.body.errors[0]?.status).toBe('REJECTED');
    expect(unrelatedIngRes.body.errors[0]?.error).toContain(
      'không thuộc công thức món',
    );
  });

  it('16. (Point 3) Replay offline sale cashier assignment: attributes to offline cashier snapshot, not current active cashier session', async () => {
    // Tạo thêm Nhân viên B tại chi nhánh
    const pinHashB = await CryptoUtil.hashPin('5678');
    const employeeB = await prisma.user.create({
      data: {
        homeStoreId: storeId,
        fullName: 'Trần Thu Ngân B E2E',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        pinCredential: {
          create: { pinHash: pinHashB, pinVersion: 1 },
        },
      },
    });

    // Mở ca CashierSession trên thiết bị cho Nhân viên B (activeSession lúc replay)
    await prisma.cashierSession.updateMany({
      where: { deviceId, status: 'ACTIVE' },
      data: { status: 'CLOSED', endedAt: new Date() },
    });
    await prisma.cashierSession.create({
      data: {
        id: randomUUID(),
        deviceId,
        storeId,
        userId: employeeB.id,
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });

    // Replay đơn hàng offline do Nhân viên A (employeeCode) tạo khi offline
    const offlineOpId = randomUUID();
    const replayRes = await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: offlineOpId,
            type: 'CASH_SALE_COMPLETED',
            payload: {
              cashierCode: employeeCode, // Nhân viên A!
              items: [
                {
                  productId: productId.toString(),
                  productVariantId: variantId.toString(),
                  quantity: 1,
                },
              ],
              payment: { method: 'CASH', amountVnd: 35000 },
            },
          },
        ],
      });

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.processed[0]?.status).toBe('COMPLETED');
    const createdSaleId = replayRes.body.processed[0]?.result.id;

    // Đơn hàng PHẢI được gán cho Nhân viên A (employeeId), KHÔNG được gán cho Nhân viên B đang active session!
    const savedSale = await prisma.sale.findUniqueOrThrow({
      where: { id: createdSaleId },
    });
    expect(savedSale.cashierUserId).toBe(employeeId);
    expect(savedSale.cashierUserId).not.toBe(employeeB.id);

    // 16d. Nếu gửi cashierCode của nhân viên thuộc chi nhánh khác -> Bị từ chối REJECTED (403 Forbidden)
    const foreignStore = await prisma.store.create({
      data: {
        code: `FOR-STORE-${randomUUID().slice(0, 6)}`,
        name: 'Chi nhánh Khác',
        address: '999 Đường Khác',
      },
    });
    const foreignEmp = await prisma.user.create({
      data: {
        homeStoreId: foreignStore.id,
        fullName: 'Nhân viên Chi nhánh Khác',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        pinCredential: {
          create: { pinHash: pinHashB, pinVersion: 1 },
        },
      },
    });
    const dbForeignEmp = await prisma.user.findUniqueOrThrow({
      where: { id: foreignEmp.id },
    });
    const foreignCode = dbForeignEmp.employeeCode.toString();

    const foreignSaleRes = await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: randomUUID(),
            type: 'CASH_SALE_COMPLETED',
            payload: {
              cashierCode: foreignCode,
              items: [
                {
                  productId: productId.toString(),
                  productVariantId: variantId.toString(),
                  quantity: 1,
                },
              ],
              payment: { method: 'CASH', amountVnd: 35000 },
            },
          },
        ],
      });
    expect(foreignSaleRes.status).toBe(200);
    expect(foreignSaleRes.body.errors[0]?.status).toBe('REJECTED');
    expect(foreignSaleRes.body.errors[0]?.error).toContain(
      'không thuộc chi nhánh',
    );
  });

  it('17. (Point 4) Offline sale price & VAT snapshot: honors historical offline prices and VAT even if menu/tax changed on server', async () => {
    // 17a. Giả lập đơn offline bán lúc giá là 30,000 VND và VAT 8% (800 bps)
    // POS đã thu 30,000 VND tiền mặt (subtotal = 27,778, VAT = 2,222)
    // Nhưng trên server, giá variant hiện tại bị sửa thành 50,000 VND và category tax thành 10% (1000 bps)
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { priceVnd: 50000n },
    });

    const historicalSaleOpId = randomUUID();
    const replayPricingRes = await request(app.getHttpServer())
      .post('/sync/push')
      .set('Authorization', deviceAuthHeader)
      .send({
        operations: [
          {
            operationId: historicalSaleOpId,
            type: 'CASH_SALE_COMPLETED',
            payload: {
              cashierCode: employeeCode,
              subtotalVnd: 27778,
              taxVnd: 2222,
              totalVnd: 30000,
              items: [
                {
                  productId: productId.toString(),
                  productVariantId: variantId.toString(),
                  baseUnitPriceVnd: 30000,
                  unitPriceVnd: 30000,
                  lineTotalVnd: 30000,
                  taxRateBps: 800,
                  taxAmountVnd: 2222,
                  subtotalVnd: 27778,
                  quantity: 1,
                },
              ],
              payment: { method: 'CASH', amountVnd: 30000 },
            },
          },
        ],
      });

    expect(replayPricingRes.status).toBe(200);
    expect(replayPricingRes.body.processed[0]?.status).toBe('COMPLETED');
    const saleId = replayPricingRes.body.processed[0]?.result.id;

    // Kiểm tra Sale đã lưu đúng 30,000 VND và 2,222 VND VAT (KHÔNG bị ép thành 50,000 VND theo giá server)
    const saleInDb = await prisma.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { items: true, payments: true },
    });
    expect(Number(saleInDb.totalVnd)).toBe(30000);
    expect(Number(saleInDb.subtotalVnd)).toBe(27778);
    expect(Number(saleInDb.taxVnd)).toBe(2222);
    expect(Number(saleInDb.payments[0].amountVnd)).toBe(30000);

    // Kiểm tra SaleItem snapshot lưu đúng giá cũ 30k và VAT 8%
    expect(Number(saleInDb.items[0].baseUnitPriceVnd)).toBe(30000);
    expect(saleInDb.items[0].taxRateBpsSnapshot).toBe(800);
    expect(Number(saleInDb.items[0].lineTotalVnd)).toBe(30000);
    expect(Number(saleInDb.items[0].taxAmountVnd)).toBe(2222);
  });

  it('18. Initiate retries reuse one payment; pending blocks cash/stock/close; concurrent callback/query consumes once', async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: true },
    });
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSyncedAt: new Date(),
        lastHeartbeatAt: new Date(),
        hasPendingOutbox: false,
        outboxPendingCount: 0,
      },
    });
    const existingRegister = await prisma.registerSession.findFirst({
      where: { deviceId, status: 'OPEN' },
    });
    const registerId = existingRegister?.id ?? randomUUID();
    if (!existingRegister) {
      const opened = await request(app.getHttpServer())
        .post('/register-sessions')
        .set('Authorization', deviceAuthHeader)
        .send({ id: registerId, openingCashVnd: 100000 });
      expect(opened.status).toBe(201);
    }
    const attempt = {
      saleId: randomUUID(),
      registerSessionId: registerId,
      expectedTotalVnd: 50000,
      items: [
        {
          id: randomUUID(),
          productId: productId.toString(),
          productVariantId: variantId.toString(),
          quantity: 1,
          baseUnitPriceVnd: 1,
          taxRateBps: 0,
        },
      ],
    };
    const balanceBefore = await prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        return new Response(
          JSON.stringify(
            String(url).endsWith('/create')
              ? {
                  return_code: 1,
                  qr_code: 'synthetic-provider-payload',
                  order_url: 'https://sandbox/order',
                  zp_trans_token: 'synthetic',
                }
              : {
                  return_code: 1,
                  amount: 50000,
                  zp_trans_id: '9007199254740993',
                },
          ),
          { status: 200 },
        );
      });
    try {
      const first = await request(app.getHttpServer())
        .post('/payments/zalopay/initiate')
        .set('Authorization', deviceAuthHeader)
        .send(attempt);
      expect(first.status).toBe(200);
      const retry = await request(app.getHttpServer())
        .post('/payments/zalopay/initiate')
        .set('Authorization', deviceAuthHeader)
        .send(attempt);
      expect(retry.status).toBe(200);
      expect(retry.body.paymentId).toBe(first.body.paymentId);
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/create')),
      ).toHaveLength(1);
      expect(
        await prisma.payment.count({ where: { saleId: attempt.saleId } }),
      ).toBe(1);
      const pendingBalance = await prisma.stockBalance.findUniqueOrThrow({
        where: { storeId_ingredientId: { storeId, ingredientId } },
      });
      expect(pendingBalance.quantity.toString()).toBe(
        balanceBefore.quantity.toString(),
      );
      const changed = await request(app.getHttpServer())
        .post('/payments/zalopay/initiate')
        .set('Authorization', deviceAuthHeader)
        .send({ ...attempt, expectedTotalVnd: 1 });
      expect(changed.status).toBe(409);
      const cash = await request(app.getHttpServer())
        .post('/sales')
        .set('Authorization', deviceAuthHeader)
        .send({
          items: attempt.items,
          payment: { method: 'CASH', amountVnd: 50000 },
        });
      expect(cash.status).toBe(409);
      await expect(
        app.get(InventoryService).adjustStock(
          storeId,
          {
            movementType: 'ADJUSTMENT',
            items: [
              { ingredientId: ingredientId.toString(), quantityDelta: 1 },
            ],
            reason: 'test',
          },
          employeeId,
        ),
      ).rejects.toThrow('PAYMENT_PENDING');
      const close = await request(app.getHttpServer())
        .post(`/register-sessions/${registerId}/close`)
        .set('Authorization', deviceAuthHeader)
        .send({ actualCashVnd: 100000 });
      expect(close.status).toBe(409);
      const evidence = await prisma.saleItemConsumption.findMany({
        where: { saleItem: { saleId: attempt.saleId } },
      });
      const needed = evidence
        .filter((c) => c.ingredientId === ingredientId)
        .reduce((sum, c) => sum + Number(c.quantityTotal), 0);
      const data = JSON.stringify({
        app_id: 2553,
        app_trans_id: first.body.merchantOrderId,
        amount: 50000,
        zp_trans_id: '9007199254740993',
      });
      const mac = CryptoUtil.hmacSha256(process.env.ZALOPAY_KEY2!, data);
      const results = await Promise.all([
        request(app.getHttpServer())
          .post('/webhooks/zalopay')
          .send({ data, mac, type: 1 }),
        request(app.getHttpServer())
          .post('/webhooks/zalopay')
          .send({ data, mac, type: 1 }),
        request(app.getHttpServer())
          .get(`/payments/${first.body.paymentId}/status`)
          .set('Authorization', deviceAuthHeader),
      ]);
      expect(results[0].body.return_code).toBe(1);
      expect(results[1].body.return_code).toBe(1);
      const final = await prisma.payment.findUniqueOrThrow({
        where: { id: first.body.paymentId },
      });
      expect(final.status).toBe('PAID');
      expect(final.providerTransactionId).toBe('9007199254740993');
      const after = await prisma.stockBalance.findUniqueOrThrow({
        where: { storeId_ingredientId: { storeId, ingredientId } },
      });
      expect(Number(after.quantity)).toBe(
        Number(balanceBefore.quantity) - needed,
      );
      const paidSale = await prisma.sale.findUniqueOrThrow({
        where: { id: attempt.saleId },
      });
      expect(
        await prisma.stockMovement.count({
          where: {
            storeId,
            reason: `Đơn hàng ${paidSale.saleNumber}`,
            movementType: 'SALE_USAGE',
            ingredientId,
          },
        }),
      ).toBe(1);
      const recovered = await request(app.getHttpServer())
        .get(`/payments/zalopay/attempts/${attempt.saleId}`)
        .set('Authorization', deviceAuthHeader);
      expect(recovered.body.checkoutState).toBe('PAID');
      expect(recovered.body.qrCode).toBeUndefined();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('19. Cancel stays pending until provider expiry; reused cart IDs and paid-cancel conflict remain recoverable', async () => {
    const register = await prisma.registerSession.findFirstOrThrow({
      where: { deviceId, status: 'OPEN' },
    });
    const lineId = randomUUID();
    const attempt = {
      saleId: randomUUID(),
      registerSessionId: register.id,
      expectedTotalVnd: 50000,
      items: [
        {
          id: lineId,
          productId: productId.toString(),
          productVariantId: variantId.toString(),
          quantity: 1,
        },
      ],
    };
    let queryState = 'WAITING';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const body = String(url).endsWith('/create')
          ? {
              return_code: 1,
              qr_code: 'synthetic-qr',
              order_url: 'https://sandbox/order',
              zp_trans_token: 'synthetic',
            }
          : queryState === 'EXPIRED'
            ? { return_code: 2, sub_return_code: -54, is_processing: false }
            : { return_code: 3, is_processing: true };
        return new Response(JSON.stringify(body), { status: 200 });
      });
    try {
      const first = await request(app.getHttpServer())
        .post('/payments/zalopay/initiate')
        .set('Authorization', deviceAuthHeader)
        .send(attempt);
      expect(first.status).toBe(200);
      const waiting = await request(app.getHttpServer())
        .post(`/payments/zalopay/attempts/${attempt.saleId}/cancel`)
        .set('Authorization', deviceAuthHeader);
      expect(waiting.status).toBe(200);
      expect(waiting.body.checkoutState).toBe('WAITING');
      expect(waiting.body.qrCode).toBe('synthetic-qr');
      expect(
        (await prisma.sale.findUniqueOrThrow({ where: { id: attempt.saleId } }))
          .status,
      ).toBe('PAYMENT_PENDING');
      queryState = 'EXPIRED';
      const ended = await request(app.getHttpServer())
        .post(`/payments/zalopay/attempts/${attempt.saleId}/cancel`)
        .set('Authorization', deviceAuthHeader);
      expect(ended.body.checkoutState).toBe('FINAL_UNPAID');
      expect(ended.body.amountVnd).toBe('50000');
      const expiredSale = await prisma.sale.findUniqueOrThrow({
        where: { id: attempt.saleId },
      });
      expect(
        await prisma.stockMovement.count({
          where: {
            storeId,
            reason: `Đơn hàng ${expiredSale.saleNumber}`,
            movementType: 'SALE_USAGE',
          },
        }),
      ).toBe(0);

      queryState = 'WAITING';
      const next = { ...attempt, saleId: randomUUID() };
      const created = await request(app.getHttpServer())
        .post('/payments/zalopay/initiate')
        .set('Authorization', deviceAuthHeader)
        .send(next);
      expect(created.status).toBe(200);
      const storedLine = await prisma.saleItem.findFirstOrThrow({
        where: { saleId: next.saleId },
      });
      expect(storedLine.id).not.toBe(lineId); // Server IDs are opaque across attempts.
      expect(storedLine.productId).toBe(productId);
      const data = JSON.stringify({
        app_id: 2553,
        app_trans_id: created.body.merchantOrderId,
        amount: 50000,
        zp_trans_id: '9007199254740994',
      });
      const paid = await request(app.getHttpServer())
        .post('/webhooks/zalopay')
        .send({
          data,
          mac: CryptoUtil.hmacSha256(process.env.ZALOPAY_KEY2!, data),
          type: 1,
        });
      expect(paid.body.return_code).toBe(1);
      const conflict = await request(app.getHttpServer())
        .post(`/payments/zalopay/attempts/${next.saleId}/cancel`)
        .set('Authorization', deviceAuthHeader);
      expect(conflict.status).toBe(409);
      const recovered = await request(app.getHttpServer())
        .get(`/payments/zalopay/attempts/${next.saleId}`)
        .set('Authorization', deviceAuthHeader);
      expect(recovered.body.checkoutState).toBe('PAID');
      const nextPaidSale = await prisma.sale.findUniqueOrThrow({
        where: { id: next.saleId },
      });
      expect(
        await prisma.stockMovement.count({
          where: {
            storeId,
            reason: `Đơn hàng ${nextPaidSale.saleNumber}`,
            movementType: 'SALE_USAGE',
          },
        }),
      ).toBe(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
