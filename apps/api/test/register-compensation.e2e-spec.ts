import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CryptoUtil } from '../src/common/security/crypto.util';

describe('Blind register compensation and handover (business APIs)', () => {
  let app: INestApplication, db: PrismaService;
  let storeId: bigint, deviceId: string, auth: string, foreignAuth: string;
  let cashier: { id: bigint; employeeCode: bigint | null },
    next: typeof cashier;
  let managerToken: string, foreignManagerToken: string;
  const secret = `synthetic-register-${randomUUID()}`;
  const savedSecret = process.env.JWT_ACCESS_SECRET;
  const api = () => request(app.getHttpServer());
  const open = (
    amount = 60000,
    denominations: Record<string, number> = { '50000': 1, '10000': 1 },
  ) =>
    api().post('/register-sessions/open').set('Authorization', auth).send({
      openingCashVnd: amount,
      openingDenominations: denominations,
      openedByCode: cashier.employeeCode!.toString(),
    });
  const close = (id: string, payload: object) =>
    api()
      .post(`/register-sessions/${id}/close`)
      .set('Authorization', auth)
      .send({ closedByCode: cashier.employeeCode!.toString(), ...payload });
  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
    if (savedSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = savedSecret;
  });
  beforeEach(async () => {
    const store = await db.store.create({
      data: {
        code: `REG-${randomUUID()}`,
        name: 'Register test',
        address: 'Test only',
      },
    });
    storeId = store.id;
    deviceId = randomUUID();
    const credential = `synthetic-device-${randomUUID()}`;
    await db.device.create({
      data: {
        id: deviceId,
        storeId,
        displayName: 'Test',
        status: 'ACTIVE',
        credentialHash: CryptoUtil.sha256(credential),
      },
    });
    auth = `Device ${credential}`;
    cashier = await db.user.create({
      data: { homeStoreId: storeId, fullName: 'Cashier one', role: 'EMPLOYEE' },
    });
    next = await db.user.create({
      data: { homeStoreId: storeId, fullName: 'Cashier two', role: 'EMPLOYEE' },
    });
    const manager = await db.user.create({
      data: {
        homeStoreId: storeId,
        fullName: 'Manager',
        role: 'STORE_MANAGER',
      },
    });
    managerToken = CryptoUtil.signJwt(
      {
        userId: manager.id.toString(),
        role: 'STORE_MANAGER',
        homeStoreId: storeId.toString(),
      },
      secret,
      300,
    );
    const other = await db.store.create({
      data: { code: `REG-X-${randomUUID()}`, name: 'Foreign', address: 'Test' },
    });
    const otherCredential = `synthetic-${randomUUID()}`;
    await db.device.create({
      data: {
        id: randomUUID(),
        storeId: other.id,
        displayName: 'Foreign',
        status: 'ACTIVE',
        credentialHash: CryptoUtil.sha256(otherCredential),
      },
    });
    foreignAuth = `Device ${otherCredential}`;
    const foreignManager = await db.user.create({
      data: {
        homeStoreId: other.id,
        fullName: 'Other manager',
        role: 'STORE_MANAGER',
      },
    });
    foreignManagerToken = CryptoUtil.signJwt(
      {
        userId: foreignManager.id.toString(),
        role: 'STORE_MANAGER',
        homeStoreId: other.id.toString(),
      },
      secret,
      300,
    );
  });

  it('keeps zero amounts as zero, reports surplus and scopes complete summaries and filters', async () => {
    const zero = await open(0, {}).expect(201);
    await close(zero.body.id, {
      actualCashVnd: 0,
      closingDenominations: {},
    }).expect(200);
    const surplus = await open().expect(201);
    const closed = await close(surplus.body.id, {
      actualCashVnd: 70000,
      closingDenominations: { '50000': 1, '20000': 1 },
    }).expect(200);
    expect(closed.body.varianceVnd).toBe('10000');
    expect(closed.body.compensationCashVnd).toBeNull();
    const secondSurplus = await open().expect(201);
    await close(secondSurplus.body.id, {
      actualCashVnd: 70000,
      closingDenominations: { '50000': 1, '20000': 1 },
    }).expect(200);
    const list = await api()
      .get('/register-sessions?variance=SURPLUS&pageSize=1')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.total).toBe(2);
    expect(list.body.summary.surplusCashVnd).toBe('20000');
    const balanced = await api()
      .get('/register-sessions?variance=BALANCED')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(balanced.body.items[0].varianceVnd).toBe('0');
    expect(balanced.body.items[0].actualCashVnd).toBe('0');
    const foreign = await api()
      .get('/register-sessions')
      .set('Authorization', `Bearer ${foreignManagerToken}`)
      .expect(200);
    expect(foreign.body.total).toBe(0);
    expect(foreign.body.summary.surplusCashVnd).toBe('0');
    await api()
      .get(`/register-sessions?storeId=${storeId}`)
      .set('Authorization', `Bearer ${foreignManagerToken}`)
      .expect(403);
    await api()
      .get('/register-sessions')
      .set('Authorization', auth)
      .expect(401);
  });

  it('requires full compensation, retains original shortage, accepts overpayment and carries every note exactly once through sync', async () => {
    const opened = await open().expect(201);
    const payload = {
      actualCashVnd: 25000,
      closingDenominations: { '20000': 1, '5000': 1 },
      closingMode: 'HANDOVER',
      compensationCashVnd: 30000,
      compensationDenominations: { '20000': 1, '10000': 1 },
    };
    await close(opened.body.id, payload).expect(400);
    expect(
      (
        await db.registerSession.findUniqueOrThrow({
          where: { id: opened.body.id },
        })
      ).status,
    ).toBe('OPEN');
    const operationId = randomUUID();
    const operation = {
      operationId,
      type: 'REGISTER_SESSION_CLOSED',
      payload: {
        sessionId: opened.body.id,
        closedByCode: cashier.employeeCode!.toString(),
        ...payload,
        compensationCashVnd: 50000,
        compensationDenominations: { '50000': 1 },
      },
    };
    const push = () =>
      api()
        .post('/sync/push')
        .set('Authorization', auth)
        .send({ operations: [operation] });
    const result = await push().expect(200);
    expect(result.body.processed[0].status).toBe('COMPLETED');
    const closed = await db.registerSession.findUniqueOrThrow({
      where: { id: opened.body.id },
    });
    expect(closed.varianceVnd).toBe(-35000n);
    expect(closed.compensationCashVnd).toBe(50000n);
    await push().expect(200);
    expect(
      await db.auditLog.count({
        where: { entityId: closed.id, action: 'REGISTER_SESSION_CLOSED' },
      }),
    ).toBe(1);
    await open().expect(409);
    const nextId = randomUUID();
    const receive = {
      operationId: randomUUID(),
      type: 'REGISTER_SESSION_OPENED',
      payload: {
        id: nextId,
        handoverFromSessionId: closed.id,
        openingCashVnd: 75000,
        openingDenominations: { '50000': 1, '20000': 1, '5000': 1 },
        openedByCode: next.employeeCode!.toString(),
      },
    };
    const nextPush = () =>
      api()
        .post('/sync/push')
        .set('Authorization', auth)
        .send({ operations: [receive] });
    expect((await nextPush().expect(200)).body.processed[0].status).toBe(
      'COMPLETED',
    );
    await nextPush().expect(200);
    const received = await db.registerSession.findUniqueOrThrow({
      where: { id: nextId },
    });
    expect(received.openingCashVnd).toBe(75000n);
    expect(received.openedByUserId).toBe(next.id);
    expect(received.openingDenominations).toEqual(
      receive.payload.openingDenominations,
    );
    expect(
      await db.registerSession.count({
        where: { handoverFromSessionId: closed.id },
      }),
    ).toBe(1);
    const list = await api()
      .get('/register-sessions?variance=SHORTAGE')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(list.body.summary.shortageCashVnd).toBe('35000');
    expect(list.body.summary.compensationCashVnd).toBe('50000');
  });

  it('computes expected cash from cash payments only and never books compensation as a sale', async () => {
    const opened = await open().expect(201);
    for (const [method, amount] of [
      ['CASH', 10000n],
      ['ZALOPAY', 20000n],
    ] as const) {
      await db.sale.create({
        data: {
          id: randomUUID(),
          storeId,
          deviceId,
          cashierUserId: cashier.id,
          registerSessionId: opened.body.id,
          saleNumber: randomUUID(),
          status: 'PAID',
          subtotalVnd: amount,
          taxVnd: 0n,
          totalVnd: amount,
          businessDate: new Date('2026-10-19T00:00:00Z'),
          completedAt: new Date(),
          payments: {
            create: {
              id: randomUUID(),
              storeId,
              method,
              provider: method === 'CASH' ? 'INTERNAL' : 'ZALOPAY_SANDBOX',
              status: 'PAID',
              amountVnd: amount,
              paidAt: new Date(),
            },
          },
        },
      });
    }
    const closed = await close(opened.body.id, {
      actualCashVnd: 60000,
      closingDenominations: { '50000': 1, '10000': 1 },
      compensationCashVnd: 10000,
      compensationDenominations: { '10000': 1 },
    }).expect(200);
    expect(closed.body.expectedCashVnd).toBe('70000');
    expect(closed.body.varianceVnd).toBe('-10000');
    expect(await db.sale.count({ where: { storeId } })).toBe(2);
    expect(await db.payment.count({ where: { storeId } })).toBe(2);
  });

  it('end of day starts the next session independently and foreign device cannot close another drawer', async () => {
    const opened = await open().expect(201);
    await api()
      .post(`/register-sessions/${opened.body.id}/close`)
      .set('Authorization', foreignAuth)
      .send({ actualCashVnd: 60000 })
      .expect(404);
    await close(opened.body.id, {
      actualCashVnd: 60000,
      closingDenominations: { '50000': 1, '10000': 1 },
      closingMode: 'END_OF_DAY',
    }).expect(200);
    const following = await open(10000, { '10000': 1 }).expect(201);
    expect(following.body.handoverFromSessionId).toBeNull();
  });

  it.each([
    { compensationCashVnd: -1, compensationDenominations: {} },
    { compensationCashVnd: 50000, compensationDenominations: { '50000': 0.5 } },
    { compensationCashVnd: 50000, compensationDenominations: { '50000': -1 } },
    { compensationCashVnd: 50000, compensationDenominations: { '12345': 4 } },
    { compensationCashVnd: 50000, compensationDenominations: { '20000': 1 } },
  ])(
    'rejects forged compensation through sync as well as HTTP (%j)',
    async (compensation) => {
      const opened = await open().expect(201);
      const payload = {
        actualCashVnd: 25000,
        closingDenominations: { '20000': 1, '5000': 1 },
        ...compensation,
      };
      await close(opened.body.id, payload).expect(400);
      const sync = await api()
        .post('/sync/push')
        .set('Authorization', auth)
        .send({
          operations: [
            {
              operationId: randomUUID(),
              type: 'REGISTER_SESSION_CLOSED',
              payload: {
                sessionId: opened.body.id,
                closedByCode: cashier.employeeCode!.toString(),
                ...payload,
              },
            },
          ],
        })
        .expect(200);
      expect(sync.body.processed).toHaveLength(0);
      expect(
        (
          await db.registerSession.findUniqueOrThrow({
            where: { id: opened.body.id },
          })
        ).status,
      ).toBe('OPEN');
    },
  );
});
