import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CryptoUtil } from '../src/common/security/crypto.util';
import { PaymentsService } from '../src/payments/payments.service';
import { MomoReconciliationWorker } from '../src/payments/momo-reconciliation.worker';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { config } from 'dotenv';
import { resolve } from 'node:path';

/** Real business HTTP APIs + PostgreSQL + real MoMo adapter. Only provider transport is simulated. */
describe('MoMo polling without IPN (business API integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: string, foreignAuth: string, registerId: string, saleId: string;
  let storeId: bigint, ingredientId: bigint;
  let cart: Record<string, unknown>;
  let fetchSpy: jest.SpyInstance;
  let resultCode: number,
    queryAmount: number,
    queryCount: number,
    createCount: number;
  let queryTimeout: boolean, loseCreate: boolean, wrongOrder: boolean;
  let createdBodies: Record<string, unknown>[];
  let queryGate: Promise<void> | undefined;
  const liveSandbox = process.env.POS_MOMO_LIVE_SANDBOX === '1';
  const jwtSecret = `momo-e2e-${randomUUID()}`;
  const realFetch = global.fetch.bind(globalThis);
  const envKeys = [
    'JWT_ACCESS_SECRET',
    'ZALOPAY_APP_ID',
    'ZALOPAY_KEY1',
    'ZALOPAY_KEY2',
    'MOMO_PARTNER_CODE',
    'MOMO_ACCESS_KEY',
    'MOMO_SECRET_KEY',
    'MOMO_IPN_URL',
    'MOMO_REDIRECT_URL',
  ];
  const savedEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const hmac = (raw: string) =>
    createHmac('sha256', 'synthetic-momo-test-secret')
      .update(raw)
      .digest('hex');
  const api = () => request(app.getHttpServer());
  const start = () =>
    api()
      .post('/api/v1/payments/online/initiate')
      .set('Authorization', auth)
      .send(cart);
  const poll = () =>
    api()
      .get(`/api/v1/payments/online/attempts/${saleId}`)
      .set('Authorization', auth);
  const startZaloPay = () =>
    api()
      .post('/api/v1/payments/online/initiate')
      .set('Authorization', auth)
      .send({ ...cart, provider: 'ZALOPAY' });
  const manualCheck = () =>
    api()
      .post(`/api/v1/payments/online/attempts/${saleId}/check`)
      .set('Authorization', auth)
      .send({});
  const payment = () => prisma.payment.findFirstOrThrow({ where: { saleId } });
  const stock = () =>
    prisma.stockBalance.findUniqueOrThrow({
      where: { storeId_ingredientId: { storeId, ingredientId } },
    });
  const due = async () =>
    prisma.payment.updateMany({
      where: { saleId },
      data: { lastQueriedAt: new Date(0) },
    });
  const cancel = () =>
    api()
      .post(`/api/v1/payments/online/attempts/${saleId}/cancel`)
      .set('Authorization', auth)
      .send({});
  const paidIpn = async () => {
    const p = await payment();
    const payload = {
      partnerCode: process.env.MOMO_PARTNER_CODE!,
      orderId: p.merchantOrderId!,
      requestId: p.merchantOrderId!,
      amount: 35000,
      transId: '9007199254740993',
      responseTime: Date.now(),
      resultCode: 0,
      extraData: '',
      message: 'Successful',
      orderInfo: 'Coffee',
      orderType: 'momo_wallet',
      payType: 'qr',
    };
    const signature = hmac(
      `accessKey=synthetic-access&amount=${payload.amount}&extraData=&message=Successful&orderId=${payload.orderId}&orderInfo=Coffee&orderType=momo_wallet&partnerCode=${payload.partnerCode}&payType=qr&requestId=${payload.requestId}&responseTime=${payload.responseTime}&resultCode=0&transId=${payload.transId}`,
    );
    return api()
      .post('/api/v1/webhooks/momo')
      .send({ ...payload, signature });
  };

  beforeAll(async () => {
    if (liveSandbox)
      config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
    else
      Object.assign(process.env, {
        MOMO_PARTNER_CODE: 'MOMO_POLLING_TEST',
        MOMO_ACCESS_KEY: 'synthetic-access',
        MOMO_SECRET_KEY: 'synthetic-momo-test-secret',
        MOMO_IPN_URL: 'https://unreachable.example.test/api/v1/webhooks/momo',
        MOMO_REDIRECT_URL: 'https://unreachable.example.test/return',
      });
    process.env.JWT_ACCESS_SECRET = jwtSecret;
    Object.assign(process.env, {
      ZALOPAY_APP_ID: '2553',
      ZALOPAY_KEY1: 'synthetic-zalopay-manual-key1',
      ZALOPAY_KEY2: 'synthetic-zalopay-manual-key2',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MomoReconciliationWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    resultCode = 1000;
    queryAmount = 35000;
    queryCount = 0;
    createCount = 0;
    queryTimeout = false;
    loseCreate = false;
    wrongOrder = false;
    createdBodies = [];
    queryGate = undefined;
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, init) => {
        if (String(url).startsWith('https://sb-openapi.zalopay.vn/v2/')) {
          if (String(url).endsWith('/create')) {
            createCount++;
            return new Response(
              JSON.stringify({
                return_code: 1,
                qr_code: 'synthetic-zalopay-qr',
                order_url: 'https://sandbox.example.test/pay',
                zp_trans_token: 'synthetic-zalopay-token',
              }),
            );
          }
          expect(String(url)).toBe('https://sb-openapi.zalopay.vn/v2/query');
          queryCount++;
          if (queryGate) await queryGate;
          if (queryTimeout) throw new Error('network timeout');
          return new Response(
            JSON.stringify({
              return_code: resultCode === 0 ? 1 : resultCode === 1000 ? 3 : 2,
              amount: queryAmount,
              zp_trans_id: '9007199254740993',
            }),
          );
        }
        expect(String(url)).toMatch(
          /^https:\/\/test-payment\.momo\.vn\/v2\/gateway\/api\/(create|query)$/,
        );
        if (liveSandbox) {
          const response = await realFetch(url, init);
          const result = (await response.clone().json()) as Record<
            string,
            unknown
          >;
          // Operational evidence only: no keys, payload, signatures or payment URL tokens.
          console.info('MoMo Sandbox observation', {
            operation: String(url).endsWith('/create') ? 'create' : 'query',
            httpStatus: response.status,
            resultCode: result.resultCode,
            hasQr: typeof result.qrCodeUrl === 'string' && !!result.qrCodeUrl,
            hasSignature: typeof result.signature === 'string',
          });
          return response;
        }
        const body = JSON.parse(String(init?.body));
        if (String(url).endsWith('/create')) {
          createCount++;
          createdBodies.push(body);
          expect(body.signature).toBe(
            hmac(
              `accessKey=synthetic-access&amount=${body.amount}&extraData=${body.extraData}&ipnUrl=${body.ipnUrl}&orderId=${body.orderId}&orderInfo=${body.orderInfo}&partnerCode=${body.partnerCode}&redirectUrl=${body.redirectUrl}&requestId=${body.requestId}&requestType=${body.requestType}`,
            ),
          );
          if (loseCreate)
            throw new Error('provider accepted but response was lost');
          const response = {
            partnerCode: body.partnerCode,
            requestId: body.requestId,
            orderId: body.orderId,
            amount: body.amount,
            responseTime: Date.now(),
            message: 'Successful.',
            resultCode: 0,
            payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=synthetic',
            qrCodeUrl: 'synthetic-original-qr',
          };
          return new Response(
            JSON.stringify({
              ...response,
              signature: hmac(
                `accessKey=synthetic-access&amount=${response.amount}&message=${response.message}&orderId=${response.orderId}&partnerCode=${response.partnerCode}&payUrl=${response.payUrl}&requestId=${response.requestId}&responseTime=${response.responseTime}&resultCode=0`,
              ),
            }),
          );
        }
        queryCount++;
        expect(body.signature).toBe(
          hmac(
            `accessKey=synthetic-access&orderId=${body.orderId}&partnerCode=${body.partnerCode}&requestId=${body.requestId}`,
          ),
        );
        if (queryTimeout) throw new Error('network timeout');
        // The documented query response has no signature field. Preserve int64 IDs.
        return new Response(
          JSON.stringify({
            partnerCode: body.partnerCode,
            requestId: body.requestId,
            orderId: wrongOrder ? 'different-order' : body.orderId,
            amount: queryAmount,
            resultCode,
            transId: resultCode === 0 ? '9007199254740993' : 0,
            responseTime: Date.now(),
          }),
        );
      });
    const tag = randomUUID().slice(0, 8);
    const store = await prisma.store.create({
      data: {
        code: `MOMO-${tag}`,
        name: 'MoMo polling test',
        address: 'Sandbox only',
      },
    });
    storeId = store.id;
    const credential = `synthetic-${randomUUID()}`;
    const device = await prisma.device.create({
      data: {
        id: randomUUID(),
        storeId,
        displayName: 'Polling POS',
        credentialHash: CryptoUtil.sha256(credential),
        status: 'ACTIVE',
        lastHeartbeatAt: new Date(),
        lastSyncedAt: new Date(),
        hasPendingOutbox: false,
        outboxPendingCount: 0,
      },
    });
    auth = `Device ${credential}`;
    const otherStore = await prisma.store.create({
      data: { code: `FOREIGN-${tag}`, name: 'Foreign scope', address: 'Test' },
    });
    const otherCredential = `synthetic-${randomUUID()}`;
    await prisma.device.create({
      data: {
        id: randomUUID(),
        storeId: otherStore.id,
        displayName: 'Foreign POS',
        credentialHash: CryptoUtil.sha256(otherCredential),
        status: 'ACTIVE',
      },
    });
    foreignAuth = `Device ${otherCredential}`;
    const user = await prisma.user.create({
      data: {
        fullName: 'Polling cashier',
        role: 'EMPLOYEE',
        homeStoreId: storeId,
        status: 'ACTIVE',
        pinCredential: {
          create: { pinHash: await CryptoUtil.hashPin('1234') },
        },
      },
    });
    await api()
      .post('/api/v1/cashier-sessions:login')
      .set('Authorization', auth)
      .send({ employeeCode: user.employeeCode.toString(), pin: '1234' })
      .expect(200);
    registerId = randomUUID();
    await api()
      .post('/api/v1/register-sessions')
      .set('Authorization', auth)
      .send({ id: registerId, openingCashVnd: 100000 })
      .expect(201);
    const category = await prisma.productCategory.create({
      data: { name: `MoMo ${tag}`, taxRateBps: 0 },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: `MP-${tag}`,
        name: 'Polling coffee',
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        code: 'M',
        sizeLabel: 'M',
        priceVnd: 35000n,
      },
    });
    const ingredient = await prisma.ingredient.create({
      data: { code: `MI-${tag}`, name: 'Coffee', baseUnit: 'G' },
    });
    ingredientId = ingredient.id;
    await prisma.stockBalance.create({
      data: { storeId, ingredientId, quantity: 1000 },
    });
    await prisma.recipeVersion.create({
      data: {
        productVariantId: variant.id,
        versionNo: 1,
        status: 'ACTIVE',
        items: { create: { ingredientId, quantity: 20 } },
      },
    });
    saleId = randomUUID();
    cart = {
      saleId,
      registerSessionId: registerId,
      expectedTotalVnd: 35000,
      provider: 'MOMO',
      items: [
        {
          id: randomUUID(),
          productId: product.id.toString(),
          productVariantId: variant.id.toString(),
          quantity: 1,
          toppings: [],
        },
      ],
    };
    expect(device.storeId).toBe(storeId);
  });

  afterEach(() => fetchSpy.mockRestore());
  afterAll(async () => {
    await app?.close();
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  (liveSandbox ? it : it.skip)(
    'live sandbox creates a QR and queries it without callback or paying',
    async () => {
      const created = await start();
      expect(created.status).toBe(200);
      expect(created.body.qrCode).toBeTruthy();
      const status = await poll().expect(200);
      expect(['WAITING', 'RECONCILING', 'FINAL_UNPAID']).toContain(
        status.body.checkoutState,
      );
      expect((await stock()).quantity.toString()).toBe('1000');
      expect((await payment()).status).not.toBe('PAID');
    },
    100_000,
  );

  it('manual ZaloPay check sees payment immediately inside the automatic query cooldown without callback', async () => {
    await startZaloPay().expect(200);
    const original = await payment();
    await poll().expect(200);
    expect(queryCount).toBe(1);
    resultCode = 0;
    expect((await poll().expect(200)).body.checkoutState).toBe('WAITING');
    expect(queryCount).toBe(1);
    const checked = await manualCheck().expect(200);
    expect(checked.body.checkoutState).toBe('PAID');
    expect(queryCount).toBe(2);
    expect((await payment()).merchantOrderId).toBe(original.merchantOrderId);
    expect(createCount).toBe(1);
    expect((await stock()).quantity.toString()).toBe('980');
    await manualCheck().expect(200);
    expect(queryCount).toBe(2);
    expect((await stock()).quantity.toString()).toBe('980');
    await api()
      .get(`/api/v1/sales/${saleId}`)
      .set('Authorization', auth)
      .expect(200);
  });

  it('coalesces manual ZaloPay checks, keeps auto polling cached and validates device scope before joining', async () => {
    await startZaloPay().expect(200);
    await poll().expect(200);
    resultCode = 0;
    let release!: () => void;
    queryGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = manualCheck().then((r) => r);
    for (let tries = 0; queryCount < 2 && tries < 100; tries++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(queryCount).toBe(2);
    const second = manualCheck().then((r) => r);
    await api()
      .post(`/api/v1/payments/online/attempts/${saleId}/check`)
      .set('Authorization', foreignAuth)
      .send({})
      .expect(403);
    await api()
      .post(`/api/v1/payments/online/attempts/${saleId}/check`)
      .send({})
      .expect(401);
    expect((await poll().expect(200)).body.checkoutState).toBe('WAITING');
    release();
    const checked = await Promise.all([first, second]);
    expect(
      checked.every((r) => r.status === 200 && r.body.checkoutState === 'PAID'),
    ).toBe(true);
    expect(queryCount).toBe(2);
    expect((await stock()).quantity.toString()).toBe('980');
  });

  it('manual ZaloPay query failure returns 503, preserves the attempt and permits an immediate retry', async () => {
    await startZaloPay().expect(200);
    await poll().expect(200);
    queryTimeout = true;
    await manualCheck().expect(503);
    expect((await payment()).status).toBe('PENDING');
    expect((await stock()).quantity.toString()).toBe('1000');
    queryTimeout = false;
    resultCode = 0;
    expect((await manualCheck().expect(200)).body.checkoutState).toBe('PAID');
    expect(createCount).toBe(1);
    expect((await stock()).quantity.toString()).toBe('980');
  });

  it.each([
    { code: 42, amount: 35000 },
    { code: 0, amount: 1 },
  ])(
    'manual ZaloPay rejects an unverifiable result (%j) without releasing the cart',
    async ({ code, amount }) => {
      await startZaloPay().expect(200);
      resultCode = code;
      queryAmount = amount;
      await manualCheck().expect(503);
      expect((await payment()).status).toBe('PENDING');
      expect((await stock()).quantity.toString()).toBe('1000');
    },
  );

  it('settles by query alone, coalesces concurrent POS polls and deducts stock once', async () => {
    await start().expect(200);
    const createdPayment = await payment();
    expect(
      createdPayment.expiresAt!.getTime() -
        createdPayment.createRequestedAt!.getTime(),
    ).toBe(300_000);
    const capabilities = await api()
      .get('/api/v1/payments/online/capabilities')
      .set('Authorization', auth)
      .expect(200);
    expect(capabilities.body.providers.MOMO.expiresInSeconds).toBe(300);
    expect((await stock()).quantity.toString()).toBe('1000');
    const waiting = await Promise.all([poll(), poll(), poll()]);
    expect(waiting.every((r) => r.status === 200)).toBe(true);
    expect(queryCount).toBe(1);
    expect(waiting[0].body.canCancelPending).toBe(true);
    expect(waiting[0].body.nextQueryAt).toBeTruthy();
    resultCode = 0;
    await due();
    const paid = await poll().expect(200);
    expect(paid.body.checkoutState).toBe('PAID');
    expect(paid.body.providerTransactionId).toBe('9007199254740993');
    await Promise.all([poll(), poll()]);
    expect((await stock()).quantity.toString()).toBe('980');
    expect(await prisma.payment.count({ where: { saleId } })).toBe(1);
    expect(
      await prisma.stockMovement.count({
        where: { storeId, movementType: 'SALE_USAGE' },
      }),
    ).toBe(1);
    await api()
      .get(`/api/v1/sales/${saleId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(createCount).toBe(1);
  });

  it('accepts concurrent initiate retries without creating a second provider order', async () => {
    const responses = await Promise.all([start(), start()]);
    expect(responses.some((response) => response.status === 200)).toBe(true);
    expect(
      responses.every((response) => [200, 409].includes(response.status)),
    ).toBe(true);
    expect(createCount).toBe(1);
    expect(await prisma.payment.count({ where: { saleId } })).toBe(1);
    expect((await stock()).quantity.toString()).toBe('1000');
  });

  it('keeps unresolved payment locked on timeout/countdown and forbids foreign scope', async () => {
    await start().expect(200);
    queryTimeout = true;
    await prisma.payment.updateMany({
      where: { saleId },
      data: { expiresAt: new Date(0) },
    });
    expect((await poll().expect(200)).body.checkoutState).toBe('RECONCILING');
    await api()
      .get(`/api/v1/payments/online/attempts/${saleId}`)
      .set('Authorization', foreignAuth)
      .expect(403);
    await api()
      .post(`/api/v1/register-sessions/${registerId}/close`)
      .set('Authorization', auth)
      .send({ actualCashVnd: 100000 })
      .expect(409);
    await api()
      .post('/api/v1/sales')
      .set('Authorization', auth)
      .send({
        id: randomUUID(),
        registerSessionId: registerId,
        items: cart.items,
        payment: { method: 'CASH', amountVnd: 35000 },
      })
      .expect(409);
    expect((await payment()).status).toBe('PENDING');
    expect((await stock()).quantity.toString()).toBe('1000');
  });

  it('continues reconciliation with no POS requests and recovers after restarting worker', async () => {
    await start().expect(200);
    resultCode = 0;
    // A fresh instance represents API restart; work/evidence lives in PostgreSQL.
    const worker = new MomoReconciliationWorker({
      reconcilePendingMomo: () =>
        app.get(PaymentsService).reconcilePendingMomo(storeId),
    } as PaymentsService);
    await worker.tick();
    worker.onModuleDestroy();
    expect((await payment()).status).toBe('PAID');
    expect((await stock()).quantity.toString()).toBe('980');
  });

  it('recovers a lost QR using the same request snapshot after lease expiry', async () => {
    loseCreate = true;
    await start().expect(502);
    await start().expect(409);
    expect(createCount).toBe(1);
    const first = await payment();
    loseCreate = false;
    process.env.MOMO_IPN_URL = 'https://changed.example.test/new-ipn';
    await prisma.payment.update({
      where: { id: first.id },
      data: { createLeaseUntil: new Date(0) },
    });
    await app.get(PaymentsService).reconcilePendingMomo(storeId);
    expect(createCount).toBe(2);
    expect(createdBodies[1]).toEqual(createdBodies[0]);
    const restored = await poll().expect(200);
    expect(restored.body.qrCode).toBe('synthetic-original-qr');
    expect((await payment()).id).toBe(first.id);
    expect((await stock()).quantity.toString()).toBe('1000');
    process.env.MOMO_IPN_URL =
      'https://unreachable.example.test/api/v1/webhooks/momo';
  });

  it.each([9000, 7000, 7002, 42])(
    'does not release pending transaction for result %s',
    async (code) => {
      await start().expect(200);
      resultCode = code;
      const status = await poll().expect(200);
      expect(status.body.checkoutState).not.toBe('PAID');
      expect(status.body.checkoutState).not.toBe('FINAL_UNPAID');
      expect((await stock()).quantity.toString()).toBe('1000');
    },
  );

  it('locally cancels despite provider timeout, preserves tombstone and creates a new QR identity', async () => {
    await start().expect(200);
    await poll().expect(200);
    const count = queryCount;
    queryTimeout = true;
    const cancelled = await api()
      .post(`/api/v1/payments/online/attempts/${saleId}/cancel`)
      .set('Authorization', auth)
      .send({})
      .expect(200);
    expect(cancelled.body.checkoutState).toBe('CANCELLED');
    expect(cancelled.body.cancellationMode).toBe('LOCAL');
    expect(cancelled.body.cancelledAt).toBeTruthy();
    expect(queryCount).toBe(count);
    const old = await payment();
    await api()
      .post(`/api/v1/payments/online/attempts/${saleId}/cancel`)
      .set('Authorization', auth)
      .send({})
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { entityId: old.id, action: 'PAYMENT_CANCELLED_LOCALLY' },
      }),
    ).toBe(1);
    expect((await start()).status).toBeGreaterThanOrEqual(400);
    expect(createCount).toBe(1);
    const replacement = await api()
      .post('/api/v1/payments/online/initiate')
      .set('Authorization', auth)
      .send({ ...cart, saleId: randomUUID() })
      .expect(200);
    expect(replacement.body.paymentId).not.toBe(old.id);
    expect(replacement.body.merchantOrderId).not.toBe(old.merchantOrderId);
    expect(createCount).toBe(2);
    expect((await stock()).quantity.toString()).toBe('1000');
  });

  it('rejects wrong query amount/order as payment evidence', async () => {
    await start().expect(200);
    resultCode = 0;
    queryAmount = 35001;
    expect((await poll().expect(200)).body.checkoutState).not.toBe('PAID');
    queryAmount = 35000;
    wrongOrder = true;
    await due();
    expect((await poll().expect(200)).body.checkoutState).not.toBe('PAID');
    expect((await stock()).quantity.toString()).toBe('1000');
  });

  it('records late IPN once, never settles cancelled sale, and allows a new cash sale', async () => {
    await start().expect(200);
    const old = await payment();
    await cancel().expect(200);
    expect((await paidIpn()).status).toBe(204);
    expect((await paidIpn()).status).toBe(204);
    const cancelled = await payment();
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.providerConfirmedAt).toBeTruthy();
    expect(cancelled.providerFinalizedAt).toBeTruthy();
    expect(
      (await prisma.sale.findUniqueOrThrow({ where: { id: saleId } })).status,
    ).toBe('CANCELLED');
    expect(
      await prisma.auditLog.count({
        where: { entityId: old.id, action: 'PAYMENT_RECEIVED_AFTER_CANCEL' },
      }),
    ).toBe(1);
    expect((await stock()).quantity.toString()).toBe('1000');
    expect(await prisma.stockMovement.count({ where: { storeId } })).toBe(0);
    const status = await poll().expect(200);
    expect(status.body.checkoutState).toBe('CANCELLED');
    expect(status.body.requiresReconciliation).toBe(true);
    await api()
      .post('/api/v1/sales')
      .set('Authorization', auth)
      .send({
        id: randomUUID(),
        registerSessionId: registerId,
        items: cart.items,
        payment: { method: 'CASH', amountVnd: 35000 },
      })
      .expect(201);
    expect((await stock()).quantity.toString()).toBe('980');

    const owner = await prisma.user.upsert({
      where: { employeeCode: 1000001n },
      create: { fullName: 'Owner exception test', role: 'OWNER' },
      update: {},
    });
    const token = CryptoUtil.signJwt(
      { userId: owner.id.toString(), role: 'OWNER' },
      jwtSecret,
      300,
    );
    const exceptions = await api()
      .get('/api/v1/payments/online/cancelled-receipts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      exceptions.body.items.some((p: { id: string }) => p.id === old.id),
    ).toBe(true);
    const foreign = await prisma.device.findFirstOrThrow({
      where: { credentialHash: CryptoUtil.sha256(foreignAuth.slice(7)) },
    });
    const manager = await prisma.user.create({
      data: {
        fullName: 'Foreign manager',
        role: 'STORE_MANAGER',
        homeStoreId: foreign.storeId,
      },
    });
    const managerToken = CryptoUtil.signJwt(
      {
        userId: manager.id.toString(),
        role: 'STORE_MANAGER',
        homeStoreId: foreign.storeId.toString(),
      },
      jwtSecret,
      300,
    );
    const hidden = await api()
      .get('/api/v1/payments/online/cancelled-receipts')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(hidden.body.items.some((p: { id: string }) => p.id === old.id)).toBe(
      false,
    );
    await api().get('/api/v1/payments/online/cancelled-receipts').expect(401);
  });

  it('worker keeps watching cancelled QR and records late query without touching stock', async () => {
    await start().expect(200);
    await cancel().expect(200);
    resultCode = 1000;
    await app.get(PaymentsService).reconcilePendingMomo(storeId);
    expect((await payment()).providerFinalizedAt).toBeNull();
    resultCode = 0;
    await due();
    await app.get(PaymentsService).reconcilePendingMomo(storeId);
    expect((await payment()).status).toBe('CANCELLED');
    expect((await payment()).providerConfirmedAt).toBeTruthy();
    const count = queryCount;
    await due();
    await app.get(PaymentsService).reconcilePendingMomo(storeId);
    expect(queryCount).toBe(count);
    expect((await stock()).quantity.toString()).toBe('1000');
  });

  it('stops watching cancelled QR only after matching final-unpaid result', async () => {
    await start().expect(200);
    await cancel().expect(200);
    resultCode = 1006;
    queryAmount = 35001;
    await app.get(PaymentsService).reconcilePendingMomo(storeId);
    expect((await payment()).providerFinalizedAt).toBeNull();
    queryAmount = 35000;
    await due();
    await app.get(PaymentsService).reconcilePendingMomo(storeId);
    expect((await payment()).status).toBe('CANCELLED');
    expect((await payment()).providerFinalizedAt).toBeTruthy();
    expect((await payment()).providerConfirmedAt).toBeNull();
  });

  it('serializes concurrent cancel and signed payment confirmation', async () => {
    await start().expect(200);
    const [c, confirmation] = await Promise.all([cancel(), paidIpn()]);
    expect(confirmation.status).toBe(204);
    const final = await payment();
    if (c.status === 200) {
      expect(final.status).toBe('CANCELLED');
      expect(final.providerConfirmedAt).toBeTruthy();
      expect((await stock()).quantity.toString()).toBe('1000');
    } else {
      expect(c.status).toBe(409);
      expect(final.status).toBe('PAID');
      expect((await stock()).quantity.toString()).toBe('980');
    }
  });

  it('refuses local cancellation when verified money is awaiting stock settlement', async () => {
    await start().expect(200);
    await prisma.stockBalance.update({
      where: { storeId_ingredientId: { storeId, ingredientId } },
      data: { quantity: 0 },
    });
    resultCode = 0;
    await poll().expect(200);
    expect((await payment()).providerConfirmedAt).toBeTruthy();
    await cancel().expect(409);
    expect((await payment()).status).toBe('PENDING');
  });

  it('rejects foreign-device cancellation without releasing the pending attempt', async () => {
    await start().expect(200);
    await api()
      .post(`/api/v1/payments/online/attempts/${saleId}/cancel`)
      .set('Authorization', foreignAuth)
      .send({})
      .expect(403);
    expect((await payment()).status).toBe('PENDING');
  });

  it('does not expose an in-flight create response after server cancellation', async () => {
    const transport = fetchSpy.getMockImplementation()!;
    let notifyStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchSpy.mockImplementation(async (...args) => {
      const response = await transport(...args);
      if (String(args[0]).endsWith('/create')) {
        notifyStarted();
        await gate;
      }
      return response;
    });
    const creating = start().then((r) => r);
    await started;
    try {
      expect((await cancel()).body.checkoutState).toBe('CANCELLED');
    } finally {
      release();
    }
    expect((await creating).status).toBe(409);
    const status = await poll().expect(200);
    expect(status.body.checkoutState).toBe('CANCELLED');
    expect(status.body.qrCode).toBeUndefined();
    expect((await payment()).providerFinalizedAt).toBeNull();
    expect((await stock()).quantity.toString()).toBe('1000');
  });

  it('preserves paid provider evidence on settlement failure and retries without another charge', async () => {
    await start().expect(200);
    resultCode = 0;
    await prisma.stockBalance.update({
      where: { storeId_ingredientId: { storeId, ingredientId } },
      data: { quantity: 0 },
    });
    expect((await poll().expect(200)).body.checkoutState).toBe('RECONCILING');
    expect((await payment()).providerConfirmedAt).toBeTruthy();
    expect(await prisma.stockMovement.count({ where: { storeId } })).toBe(0);
    await prisma.stockBalance.update({
      where: { storeId_ingredientId: { storeId, ingredientId } },
      data: { quantity: 1000 },
    });
    await due();
    await app.get(PaymentsService).reconcilePendingMomo(storeId);
    expect((await payment()).status).toBe('PAID');
    expect(queryCount).toBe(1);
    expect(createCount).toBe(1);
    expect((await stock()).quantity.toString()).toBe('980');
  });
});
