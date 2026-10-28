import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import {
  createServer,
  Server,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CryptoUtil } from '../src/common/security/crypto.util';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';

// This suite runs only through setup-env.ts's local *_e2e database guard.
// All identities and credentials below are synthetic and never printed.
describe('Catalog -> receiving -> offline cash rehearsal', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: Server | undefined;
  let fixture: Record<string, string>;
  let offline = false;
  let deviceId: string | undefined;
  const androidSerial = process.env.POS_ANDROID_REHEARSAL_SERIAL;
  const run = promisify(execFile);

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = `synthetic-${randomUUID()}`;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (gateway)
      await new Promise<void>((resolve, reject) =>
        gateway!.close((err) => (err ? reject(err) : resolve())),
      );
    await app?.close();
  });

  async function createFixture() {
    const tag = randomUUID().slice(0, 8);
    const store = await prisma.store.create({
      data: {
        code: `REH-${tag}`,
        name: 'Rehearsal only',
        address: 'Isolated sandbox',
      },
    });
    const foreignStore = await prisma.store.create({
      data: {
        code: `FOREIGN-${tag}`,
        name: 'Foreign sandbox',
        address: 'Isolated',
      },
    });
    const owner = await prisma.user.upsert({
      where: { employeeCode: 1000001n },
      create: { fullName: 'Synthetic Owner', role: 'OWNER' },
      update: {},
    });
    const employee = await prisma.user.create({
      data: {
        fullName: 'Synthetic Cashier',
        role: 'EMPLOYEE',
        homeStoreId: store.id,
        pinCredential: {
          create: { pinHash: await CryptoUtil.hashPin('1234') },
        },
      },
    });
    const manager = await prisma.user.create({
      data: {
        fullName: 'Synthetic SM',
        role: 'STORE_MANAGER',
        homeStoreId: foreignStore.id,
      },
    });
    const category = await prisma.productCategory.create({
      data: { name: `Coffee ${tag}`, taxRateBps: 0 },
    });
    const hiddenCategory = await prisma.productCategory.create({
      data: { name: `Hidden ${tag}`, isActive: false },
    });
    const product = await prisma.product.create({
      data: {
        code: `CF-${tag}`,
        name: 'Rehearsal coffee',
        categoryId: category.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        code: 'M',
        sizeLabel: 'M',
        priceVnd: 35000n,
        isDefault: true,
      },
    });
    const inactiveVariant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        code: 'L',
        sizeLabel: 'L',
        priceVnd: 47000n,
        isActive: false,
      },
    });
    const hiddenProduct = await prisma.product.create({
      data: {
        code: `HIDDEN-${tag}`,
        name: 'Hidden category drink',
        categoryId: hiddenCategory.id,
        variants: {
          create: {
            code: 'M',
            sizeLabel: 'M',
            priceVnd: 29000n,
            isDefault: true,
          },
        },
      },
    });
    const noSizeProduct = await prisma.product.create({
      data: {
        code: `NOSIZE-${tag}`,
        name: 'No active sizes',
        categoryId: category.id,
        variants: {
          create: {
            code: 'M',
            sizeLabel: 'M',
            priceVnd: 29000n,
            isActive: false,
          },
        },
      },
    });
    const topping = await prisma.topping.create({
      data: { code: `TOP-${tag}`, name: 'Pearl test', priceVnd: 5000n },
    });
    await prisma.productTopping.create({
      data: { productId: product.id, toppingId: topping.id },
    });
    const ingredient = await prisma.ingredient.create({
      data: { code: `ING-${tag}`, name: 'Coffee test', baseUnit: 'G' },
    });
    await prisma.stockBalance.create({
      data: { storeId: store.id, ingredientId: ingredient.id, quantity: 1000 },
    });
    const recipe = await prisma.recipeVersion.create({
      data: {
        productVariantId: variant.id,
        versionNo: 1,
        status: 'ACTIVE',
        items: { create: { ingredientId: ingredient.id, quantity: 20 } },
      },
    });
    await prisma.toppingItem.create({
      data: { toppingId: topping.id, ingredientId: ingredient.id, quantity: 2 },
    });
    await prisma.syncChange.create({
      data: {
        storeId: null,
        entityType: 'catalog_reset',
        entityId: tag,
        changeType: 'UPSERT',
        payload: {},
      },
    });
    const ownerAuth = `Bearer ${CryptoUtil.signJwt({ userId: owner.id.toString(), role: 'OWNER' }, process.env.JWT_ACCESS_SECRET!)}`;
    const managerAuth = `Bearer ${CryptoUtil.signJwt({ userId: manager.id.toString(), role: 'STORE_MANAGER', homeStoreId: foreignStore.id.toString() }, process.env.JWT_ACCESS_SECRET!)}`;
    const activation = await request(app.getHttpServer())
      .post('/api/v1/device-activations')
      .set('Authorization', ownerAuth)
      .send({ storeId: store.id.toString() });
    expect(activation.status).toBe(201);
    fixture = {
      ownerAuth,
      managerAuth,
      activationCode: activation.body.activationCode,
      storeId: store.id.toString(),
      employeeCode: employee.employeeCode.toString(),
      pin: '1234',
      productId: product.id.toString(),
      variantId: variant.id.toString(),
      inactiveVariantId: inactiveVariant.id.toString(),
      categoryId: category.id.toString(),
      hiddenProductId: hiddenProduct.id.toString(),
      noSizeProductId: noSizeProduct.id.toString(),
      toppingId: topping.id.toString(),
      ingredientId: ingredient.id.toString(),
      ingredientCode: ingredient.code,
      recipeId: recipe.id.toString(),
    };
    return fixture;
  }

  it('receives once, preserves pending-outbox gate, and consumes cash sale exactly once', async () => {
    const f = await createFixture();
    const api = request(app.getHttpServer());
    const enrollment = await api.post('/api/v1/device/enroll').send({
      activationCode: f.activationCode,
      displayName: 'API rehearsal',
      appVersion: 'test',
    });
    expect(enrollment.status).toBe(200);
    const auth = `Device ${enrollment.body.deviceCredential}`;
    const id = enrollment.body.deviceId;
    expect(
      (
        await api
          .post('/api/v1/cashier-sessions:login')
          .set('Authorization', auth)
          .send({ employeeCode: f.employeeCode, pin: f.pin })
      ).status,
    ).toBe(200);
    expect(
      (
        await api
          .get('/api/v1/sync/pull?cursor=invalid')
          .set('Authorization', auth)
      ).status,
    ).toBe(400);
    const snapshot = await api
      .get('/api/v1/sync/pull?cursor=0&limit=1')
      .set('Authorization', auth);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.hasMore).toBe(false);
    expect(
      snapshot.body.changes
        .find(
          (c: any) => c.entityType === 'products' && c.entityId === f.productId,
        )
        .payload.variants.find((v: any) => v.id === f.inactiveVariantId)
        .isActive,
    ).toBe(false);
    const receipt = await api
      .post(`/api/v1/stores/${f.storeId}/stock-receipts`)
      .set('Authorization', f.ownerAuth)
      .send({
        sourceType: 'EXTERNAL_SUPPLIER',
        sourceName: 'Synthetic supplier',
        lines: [
          {
            ingredientId: f.ingredientId,
            receivedQuantity: 100,
            unitCostVnd: 1,
          },
        ],
      });
    expect(receipt.status).toBe(201);
    expect(receipt.body.status).toBe('DRAFT');
    expect(
      (
        await api
          .get(`/api/v1/stock-receipts/${receipt.body.id}`)
          .set('Authorization', f.managerAuth)
      ).status,
    ).toBe(403);
    await prisma.device.update({
      where: { id },
      data: { lastHeartbeatAt: new Date(0) },
    });
    const post = () =>
      api
        .post(`/api/v1/stock-receipts/${receipt.body.id}/post`)
        .set('Authorization', f.ownerAuth)
        .set('idempotency-key', receipt.body.id);
    expect((await post()).status).toBe(400);
    await api.post('/api/v1/device/heartbeat').set('Authorization', auth).send({
      appVersion: 'test',
      hasPendingOutbox: false,
      outboxPendingCount: 0,
    });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    const register = await api
      .post('/api/v1/register-sessions')
      .set('Authorization', auth)
      .send({ id: randomUUID(), openingCashVnd: 500000 });
    expect(register.status).toBe(201);
    await api.post('/api/v1/device/heartbeat').set('Authorization', auth).send({
      appVersion: 'test',
      hasPendingOutbox: true,
      outboxPendingCount: 2,
    });
    const saleId = randomUUID();
    const operationId = randomUUID();
    const push = () =>
      api
        .post('/api/v1/sync/push')
        .set('Authorization', auth)
        .send({
          operations: [
            {
              operationId,
              type: 'CASH_SALE_COMPLETED',
              payload: {
                id: saleId,
                registerSessionId: register.body.id,
                items: [
                  {
                    productId: f.productId,
                    productVariantId: f.variantId,
                    quantity: 1,
                  },
                ],
                payment: { method: 'CASH', amountVnd: 35000 },
              },
            },
          ],
        });
    expect((await push()).body.processed[0]?.status).toBe('COMPLETED');
    expect((await push()).body.processed[0]?.status).toBe('ALREADY_PROCESSED');
    const device = await prisma.device.findUniqueOrThrow({ where: { id } });
    expect(device.hasPendingOutbox).toBe(true);
    expect(device.outboxPendingCount).toBe(2);
    const stock = await prisma.stockBalance.findUniqueOrThrow({
      where: {
        storeId_ingredientId: {
          storeId: BigInt(f.storeId),
          ingredientId: BigInt(f.ingredientId),
        },
      },
    });
    expect(stock.quantity.toString()).toBe('1080');
    expect(
      await prisma.stockMovement.count({
        where: { receiptLineId: receipt.body.lines[0].id },
      }),
    ).toBe(1);
    expect(await prisma.sale.count({ where: { id: saleId } })).toBe(1);
    expect(
      await prisma.stockMovement.count({
        where: { sourceOperationId: operationId },
      }),
    ).toBe(1);
  });

  // Opt-in only: API runs on a separate port; Android uses a controllable network gateway.
  (androidSerial ? it : it.skip)(
    'real Android Room reconciles catalog, receiving and offline cash with this API',
    async () => {
      const f = await createFixture();
      const adb = process.env.POS_REHEARSAL_ADB!;
      if (!adb || androidSerial !== 'emulator-5554')
        throw new Error('Explicit integration AVD/ADB required.');
      const avd = await run(adb, ['-s', androidSerial, 'emu', 'avd', 'name']);
      expect(avd.stdout).toContain('Coffee_POS_Integration_20261008');
      await app.listen(3010, '127.0.0.1');
      const handle = async (req: IncomingMessage, res: ServerResponse) => {
        try {
          if (req.url === '/fixture') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(f));
            return;
          }
          if (req.url?.startsWith('/control/')) {
            offline = req.url === '/control/offline';
            const device = await prisma.device.findFirstOrThrow({
              where: { storeId: BigInt(f.storeId), status: 'ACTIVE' },
            });
            deviceId = device.id;
            if (offline)
              await prisma.device.update({
                where: { id: device.id },
                data: { lastHeartbeatAt: new Date(0) },
              });
            res.end('{}');
            return;
          }
          if (!req.url?.startsWith('/api/v1/')) {
            res.writeHead(404).end();
            return;
          }
          if (offline) {
            res.writeHead(503).end('{}');
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (req.headers.authorization)
            headers.Authorization = req.headers.authorization;
          const response = await fetch(`http://127.0.0.1:3010${req.url}`, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method!)
              ? undefined
              : Buffer.concat(chunks),
          });
          res.writeHead(response.status, {
            'Content-Type': 'application/json',
          });
          res.end(await response.text());
        } catch {
          res.writeHead(500).end('{}');
        }
      };
      gateway = createServer((req, res) => {
        void handle(req, res);
      });
      await new Promise<void>((resolve, reject) => {
        gateway!.once('error', reject);
        gateway!.listen(3011, '127.0.0.1', resolve);
      });
      const result = await run(
        adb,
        [
          '-s',
          androidSerial,
          'shell',
          'am',
          'instrument',
          '-w',
          '-e',
          'class',
          'vn.id.congtc145.coffeepos.PosServerRehearsalTest',
          '-e',
          'rehearsalControlUrl',
          'http://10.0.2.2:3011/',
          'vn.id.congtc145.coffeepos.test/androidx.test.runner.AndroidJUnitRunner',
        ],
        { timeout: 180000, maxBuffer: 1024 * 1024 },
      );
      // Test emits stage names only, never fixture identities/credentials.
      console.log(result.stdout);
      expect(result.stdout).toContain('OK (1 test)');
      const stock = await prisma.stockBalance.findUniqueOrThrow({
        where: {
          storeId_ingredientId: {
            storeId: BigInt(f.storeId),
            ingredientId: BigInt(f.ingredientId),
          },
        },
      });
      expect(stock.quantity.toString()).toBe('1078'); // +100g receipt -20g coffee -2g topping
      expect(await prisma.sale.count({ where: { deviceId } })).toBe(1);
      expect(
        await prisma.stockMovement.count({
          where: { storeId: BigInt(f.storeId), movementType: 'RECEIPT' },
        }),
      ).toBe(1);
      expect(
        await prisma.stockMovement.count({
          where: { storeId: BigInt(f.storeId), movementType: 'SALE_USAGE' },
        }),
      ).toBe(1);
      expect(
        (await prisma.device.findUniqueOrThrow({ where: { id: deviceId } }))
          .hasPendingOutbox,
      ).toBe(false);
    },
    240000,
  );
});
