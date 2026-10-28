import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ZaloPaySandboxProvider } from './zalopay-sandbox.provider';

describe('PaymentsService', () => {
  let service: PaymentsService,
    prisma: any,
    tx: any,
    sales: any,
    provider: any,
    momo: any,
    sale: any,
    payment: any;
  beforeEach(() => {
    payment = {
      id: '11111111-1111-4111-8111-111111111111',
      saleId: '22222222-2222-4222-8222-222222222222',
      storeId: 1n,
      method: 'ZALOPAY',
      provider: 'ZALOPAY_SANDBOX',
      status: 'PENDING',
      amountVnd: 92000n,
      checkoutRequestHash: 'validated-intent',
      merchantOrderId: null,
      createRequestedAt: null,
      providerOrderJson: null,
      expiresAt: null,
      providerConfirmedAt: null,
      providerTransactionId: null,
    };
    sale = {
      id: payment.saleId,
      storeId: 1n,
      deviceId: 'dev-1',
      cashierUserId: 1n,
      status: 'PAYMENT_PENDING',
      totalVnd: 92000n,
      payments: [payment],
    };
    tx = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([]),
      sale: {
        findUnique: jest.fn(async () => sale),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(async () => payment),
        update: jest.fn(async ({ data }) => Object.assign(payment, data)),
        updateMany: jest.fn(async ({ data }) => {
          Object.assign(payment, data);
          return { count: 1 };
        }),
      },
      cashierSession: {
        findFirst: jest.fn(async () => ({
          userId: 1n,
          user: { status: 'ACTIVE', homeStoreId: 1n },
        })),
      },
    };
    prisma = { ...tx, $transaction: jest.fn(async (cb) => cb(tx)) };
    sales = {
      getBusinessDate: jest.fn(() => new Date('2026-10-10T00:00:00Z')),
      confirmOnlinePayment: jest.fn(async () => {
        payment.status = 'PAID';
      }),
    };
    provider = {
      assertConfigured: jest.fn(),
      createOrder: jest.fn(async () => ({
        qrCode: 'real-provider-qr',
        orderUrl: 'https://sandbox/order',
        zpTransToken: 'unit-token',
      })),
      queryOrder: jest.fn(async () => ({ state: 'UNKNOWN' })),
      cancelOrder: jest.fn(async () => 'UNKNOWN'),
      verifyCallback: jest.fn(() => true),
      getAppId: jest.fn(() => '2553'),
      integerString: (value: unknown) =>
        new ZaloPaySandboxProvider().integerString(value),
      parseJson: (raw: string) => new ZaloPaySandboxProvider().parseJson(raw),
    };
    momo = {
      verifyIpn: jest.fn(() => true),
      integer: (value: unknown) =>
        typeof value === 'number' || typeof value === 'string'
          ? String(value)
          : null,
    };
    service = new PaymentsService(prisma, sales, provider, momo);
  });
  const dto = () => ({
    saleId: '22222222-2222-4222-8222-222222222222',
    amountVnd: 92000,
  });
  const callback = (extra: object = {}) => ({
    type: 1,
    mac: 'test',
    data: JSON.stringify({
      app_id: 2553,
      app_trans_id: 'order-1',
      amount: 92000,
      zp_trans_id: '123456789',
      ...extra,
    }),
  });

  it('reuses pending payment, caches QR and does not create it again on retry', async () => {
    const first = await service.createZaloPayOrder(1n, dto(), 'dev-1');
    expect(first.paymentId).toBe(payment.id);
    expect(first.merchantOrderId).toBe(
      '261010_11111111111141118111111111111111',
    );
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(
      payment.expiresAt.getTime() - payment.createRequestedAt.getTime(),
    ).toBe(300000);
    const second = await service.createZaloPayOrder(1n, dto(), 'dev-1');
    expect(second).toEqual(first);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
  });

  it('retains claimed intent after a provider timeout and refuses a new create', async () => {
    provider.createOrder.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      service.createZaloPayOrder(1n, dto(), 'dev-1'),
    ).rejects.toThrow('timeout');
    expect(payment.createRequestedAt).not.toBeNull();
    await expect(
      service.createZaloPayOrder(1n, dto(), 'dev-1'),
    ).rejects.toThrow(ConflictException);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign store/device and amount mismatch before contacting provider', async () => {
    await expect(
      service.createZaloPayOrder(2n, dto(), 'dev-1'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createZaloPayOrder(1n, dto(), 'dev-2'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createZaloPayOrder(1n, { ...dto(), amountVnd: 1 }, 'dev-1'),
    ).rejects.toThrow(BadRequestException);
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('retries a lost MoMo QR with its persisted request only after the create lease', async () => {
    Object.assign(payment, {
      method: 'MOMO',
      provider: 'MOMO_SANDBOX',
      createAttemptCount: 0,
    });
    const snapshot = {
      orderId: 'original',
      redirectUrl: 'https://original.test/return',
    };
    Object.assign(momo, {
      assertConfigured: jest.fn(),
      prepareCreateRequest: jest.fn(() => snapshot),
      createOrder: jest
        .fn()
        .mockRejectedValueOnce(new Error('response lost'))
        .mockResolvedValue({
          qrCode: 'restored-qr',
          orderUrl: 'https://test-payment.momo.vn/pay',
        }),
    });
    await expect(
      service.createOnlineOrder(1n, dto(), 'dev-1', 'MOMO'),
    ).rejects.toThrow('response lost');
    const originalOrderId = payment.merchantOrderId;
    const originalTime = payment.createRequestedAt;
    await expect(
      service.createOnlineOrder(1n, dto(), 'dev-1', 'MOMO'),
    ).rejects.toThrow(ConflictException);
    payment.createLeaseUntil = new Date(0);
    const result = await service.createOnlineOrder(
      1n,
      { ...dto(), description: 'changed' },
      'dev-1',
      'MOMO',
    );
    expect(result.qrCode).toBe('restored-qr');
    expect(payment.merchantOrderId).toBe(originalOrderId);
    expect(payment.createRequestedAt).toBe(originalTime);
    expect(payment.createAttemptCount).toBe(2);
    expect(momo.prepareCreateRequest).toHaveBeenCalledTimes(1);
    expect(momo.createOrder.mock.calls[1][0].requestSnapshot).toEqual(snapshot);
  });

  it('does not auto retry legacy, exhausted or expired MoMo creates', async () => {
    Object.assign(payment, {
      method: 'MOMO',
      provider: 'MOMO_SANDBOX',
      createRequestedAt: new Date(),
      expiresAt: new Date(Date.now() + 900_000),
      createLeaseUntil: new Date(0),
      createAttemptCount: 1,
    });
    Object.assign(momo, {
      assertConfigured: jest.fn(),
      createOrder: jest.fn(),
    });
    await expect(
      service.createOnlineOrder(1n, dto(), 'dev-1', 'MOMO'),
    ).rejects.toThrow(ConflictException);
    payment.providerCreateRequestJson = { orderId: 'persisted' };
    payment.createAttemptCount = 3;
    await expect(
      service.createOnlineOrder(1n, dto(), 'dev-1', 'MOMO'),
    ).rejects.toThrow(ConflictException);
    payment.createAttemptCount = 1;
    payment.expiresAt = new Date(0);
    await expect(
      service.createOnlineOrder(1n, dto(), 'dev-1', 'MOMO'),
    ).rejects.toThrow(ConflictException);
    expect(momo.createOrder).not.toHaveBeenCalled();
  });

  it('MoMo cancellation is local, audited and independent of the query lease', async () => {
    Object.assign(payment, {
      method: 'MOMO',
      provider: 'MOMO_SANDBOX',
      createRequestedAt: new Date(),
      merchantOrderId: 'persisted',
      expiresAt: new Date(Date.now() + 900_000),
      providerOrderJson: { qrCode: 'qr', orderUrl: 'url' },
    });
    Object.assign(momo, {
      queryOrder: jest.fn().mockResolvedValue({ state: 'WAITING' }),
      cancelOrder: jest.fn(),
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(result.checkoutState).toBe('CANCELLED');
    expect(payment.cancelledAt).toBeTruthy();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(momo.queryOrder).not.toHaveBeenCalled();
    expect(momo.cancelOrder).not.toHaveBeenCalled();
  });

  it('fails closed for legacy duplicate payments or invalid cashier', async () => {
    sale.payments = [payment, { ...payment, id: 'other' }];
    await expect(
      service.createZaloPayOrder(1n, dto(), 'dev-1'),
    ).rejects.toThrow(ConflictException);
    sale.payments = [payment];
    tx.cashierSession.findFirst.mockResolvedValue(null);
    await expect(
      service.createZaloPayOrder(1n, dto(), 'dev-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects invalid MAC/type before reading payment', async () => {
    provider.verifyCallback.mockReturnValue(false);
    expect((await service.handleWebhook(callback())).return_code).toBe(2);
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    provider.verifyCallback.mockReturnValue(true);
    expect(
      (await service.handleWebhook({ ...callback(), type: 2 })).return_code,
    ).toBe(2);
  });

  it('rejects mismatched app, amount and provider transaction', async () => {
    expect(
      (await service.handleWebhook(callback({ app_id: 999 }))).return_code,
    ).toBe(2);
    expect(
      (await service.handleWebhook(callback({ amount: 1 }))).return_code,
    ).toBe(2);
    payment.providerTransactionId = 'different';
    expect((await service.handleWebhook(callback())).return_code).toBe(2);
    expect(sales.confirmOnlinePayment).not.toHaveBeenCalled();
  });

  it('preserves provider confirmation before settlement and acknowledges duplicate PAID', async () => {
    expect((await service.handleWebhook(callback())).return_code).toBe(1);
    expect(payment.providerConfirmedAt).not.toBeNull();
    expect(sales.confirmOnlinePayment).toHaveBeenCalledTimes(1);
    expect((await service.handleWebhook(callback())).return_code).toBe(1);
    expect(sales.confirmOnlinePayment).toHaveBeenCalledTimes(1);
  });

  it('keeps confirmed evidence when stock settlement fails, without returning PAID', async () => {
    sales.confirmOnlinePayment.mockRejectedValue(
      new Error('insufficient stock'),
    );
    expect((await service.handleWebhook(callback())).return_code).toBe(0);
    expect(payment.status).toBe('PENDING');
    expect(payment.providerConfirmedAt).not.toBeNull();
    expect((await service.getPaymentStatus(payment.id, 1n)).checkoutState).toBe(
      'RECONCILING',
    );
  });

  it('rejects a signed MoMo IPN for a different order type', async () => {
    payment.method = 'MOMO';
    payment.provider = 'MOMO_SANDBOX';
    payment.merchantOrderId = 'momo-order-1';
    await expect(
      service.handleMomoIpn({
        partnerCode: 'PARTNER_TEST',
        amount: 92000,
        transId: 123,
        responseTime: 1_760_000_000_000,
        resultCode: 0,
        extraData: '',
        message: 'Successful.',
        orderId: 'momo-order-1',
        orderInfo: 'Coffee order',
        orderType: 'unexpected',
        payType: 'qr',
        requestId: 'momo-order-1',
        signature: 'verified-by-mock',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(sales.confirmOnlinePayment).not.toHaveBeenCalled();
  });

  it('checks status scope before query and does not expire from local time alone', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    payment.expiresAt = new Date(Date.now() - 1000);
    await expect(service.getPaymentStatus(payment.id, 2n)).rejects.toThrow(
      ForbiddenException,
    );
    expect(provider.queryOrder).not.toHaveBeenCalled();
    expect((await service.getPaymentStatus(payment.id, 1n)).checkoutState).toBe(
      'RECONCILING',
    );
    expect(payment.status).toBe('PENDING');
  });

  it('expires only after provider final-unpaid response', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.queryOrder.mockResolvedValue({ state: 'EXPIRED' });
    expect((await service.getPaymentStatus(payment.id, 1n)).checkoutState).toBe(
      'FINAL_UNPAID',
    );
    expect(tx.sale.updateMany).toHaveBeenCalled();
  });

  it('does not settle a provider query with a different amount', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.queryOrder.mockResolvedValue({
      state: 'PAID',
      amountVnd: 1n,
      providerTransactionId: '123',
    });
    expect((await service.getPaymentStatus(payment.id, 1n)).status).toBe(
      'PENDING',
    );
    expect(sales.confirmOnlinePayment).not.toHaveBeenCalled();
  });

  it('does not send a provider query if the persistent lease is already held', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await service.getPaymentStatus(payment.id, 1n);
    expect(provider.queryOrder).not.toHaveBeenCalled();
  });

  it('cancels pending intent safely when provider confirms unpaid', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.queryOrder.mockResolvedValue({ state: 'EXPIRED' });
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(result.checkoutState).toBe('FINAL_UNPAID');
    expect(result.status).toBe('EXPIRED');
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });

  it('invalidates an active QR after provider confirms cancellation', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.cancelOrder.mockResolvedValue('CANCELLED');
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(provider.cancelOrder).toHaveBeenCalledWith('order');
    expect(provider.queryOrder).not.toHaveBeenCalled();
    expect(result.checkoutState).toBe('FINAL_UNPAID');
    expect(payment.status).toBe('EXPIRED');
  });

  it('keeps the cart locked when the provider cancel call times out', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.cancelOrder.mockRejectedValue(new Error('timeout'));
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(result.checkoutState).toBe('RECONCILING');
    expect(payment.status).toBe('PENDING');
    expect(tx.sale.updateMany).not.toHaveBeenCalled();
  });

  it('preserves a callback that wins after provider cancellation', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.cancelOrder.mockResolvedValue('CANCELLED');
    prisma.$transaction.mockImplementation(async (cb) => {
      payment.providerConfirmedAt = new Date();
      payment.status = 'PAID';
      return cb(tx);
    });
    await expect(service.cancelAttempt(1n, 'dev-1', sale.id)).rejects.toThrow(
      ConflictException,
    );
    expect(payment.status).toBe('PAID');
  });

  it('reconciles instead of releasing when provider says the order was captured', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.cancelOrder.mockResolvedValue('ALREADY_PAID');
    provider.queryOrder.mockResolvedValue({
      state: 'PAID',
      amountVnd: 92000n,
      providerTransactionId: 'zp-paid-1',
    });
    await expect(service.cancelAttempt(1n, 'dev-1', sale.id)).rejects.toThrow(
      ConflictException,
    );
    expect(sales.confirmOnlinePayment).toHaveBeenCalled();
    expect(tx.payment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });

  it.each(['WAITING', 'UNKNOWN'])(
    'keeps the cart locked when cancel query is %s',
    async (state) => {
      payment.createRequestedAt = new Date();
      payment.merchantOrderId = 'order';
      provider.queryOrder.mockResolvedValue({ state });
      const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
      expect(result.checkoutState).toBe('RECONCILING');
      expect(result.amountVnd).toBe('92000');
      expect(payment.status).toBe('PENDING');
      expect(tx.sale.updateMany).not.toHaveBeenCalled();
      expect(provider.queryOrder).toHaveBeenCalledTimes(1);
    },
  );

  it('retains the cached QR when cancel cannot invalidate a waiting provider order', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    payment.expiresAt = new Date(Date.now() + 300000);
    payment.providerOrderJson = {
      qrCode: 'cached-qr',
      orderUrl: 'https://sandbox/order',
    };
    provider.queryOrder.mockResolvedValue({ state: 'WAITING' });
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(result.checkoutState).toBe('WAITING');
    expect(result.qrCode).toBe('cached-qr');
    expect(payment.status).toBe('PENDING');
  });

  it('keeps a claimed provider intent pending after a cancellation query timeout', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.queryOrder.mockRejectedValue(new Error('timeout'));
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(result.checkoutState).toBe('RECONCILING');
    expect(payment.status).toBe('PENDING');
    expect(tx.sale.updateMany).not.toHaveBeenCalled();
  });

  it('cancels an unclaimed intent without creating or querying a provider order', async () => {
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(result.checkoutState).toBe('FINAL_UNPAID');
    expect(result.amountVnd).toBe('92000');
    expect(provider.queryOrder).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('rechecks a concurrent provider create claim under the checkout lock', async () => {
    tx.payment.findUnique.mockImplementation(async () => {
      payment.createRequestedAt = new Date();
      payment.merchantOrderId = 'concurrent-create';
      return payment;
    });
    const result = await service.cancelAttempt(1n, 'dev-1', sale.id);
    expect(result.checkoutState).toBe('RECONCILING');
    expect(payment.status).toBe('PENDING');
    expect(tx.sale.updateMany).not.toHaveBeenCalled();
  });

  it('never expires an amount-mismatched paid provider response', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.queryOrder.mockResolvedValue({
      state: 'PAID',
      amountVnd: 1n,
      providerTransactionId: '123',
    });
    expect(
      (await service.cancelAttempt(1n, 'dev-1', sale.id)).checkoutState,
    ).toBe('RECONCILING');
    expect(payment.status).toBe('PENDING');
    expect(sales.confirmOnlinePayment).not.toHaveBeenCalled();
  });

  it('preserves PAID if callback wins after final-unpaid query but before cancel locks', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.queryOrder.mockResolvedValue({ state: 'EXPIRED' });
    prisma.$transaction.mockImplementation(async (cb) => {
      payment.providerConfirmedAt = new Date();
      payment.status = 'PAID';
      return cb(tx);
    });
    await expect(service.cancelAttempt(1n, 'dev-1', sale.id)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.sale.updateMany).not.toHaveBeenCalled();
    expect(payment.status).toBe('PAID');
  });

  it('refuses cancelAttempt if provider query reveals order was already PAID', async () => {
    payment.createRequestedAt = new Date();
    payment.merchantOrderId = 'order';
    provider.queryOrder.mockResolvedValue({
      state: 'PAID',
      amountVnd: 92000n,
      providerTransactionId: 'zp-paid-999',
    });
    await expect(service.cancelAttempt(1n, 'dev-1', sale.id)).rejects.toThrow(
      ConflictException,
    );
    expect(sales.confirmOnlinePayment).toHaveBeenCalled();
  });

  it('refuses cross-device or foreign-store cancelAttempt', async () => {
    await expect(service.cancelAttempt(2n, 'dev-1', sale.id)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.cancelAttempt(1n, 'dev-2', sale.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('does not cancel after provider confirmation wins under the store lock', async () => {
    payment.method = 'MOMO';
    tx.payment.findUnique.mockImplementation(async () => {
      payment.providerConfirmedAt = new Date();
      return payment;
    });
    await expect(service.cancelAttempt(1n, 'dev-1', sale.id)).rejects.toThrow(
      ConflictException,
    );
    expect(payment.status).toBe('PENDING');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('idempotent local cancellation retains cancelled status even after late receipt', async () => {
    Object.assign(payment, {
      method: 'MOMO',
      provider: 'MOMO_SANDBOX',
      status: 'CANCELLED',
      providerConfirmedAt: new Date(),
    });
    expect(
      (await service.cancelAttempt(1n, 'dev-1', sale.id)).checkoutState,
    ).toBe('CANCELLED');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(sales.confirmOnlinePayment).not.toHaveBeenCalled();
  });

  it('late verified MoMo IPN records an exception without completing a cancelled sale', async () => {
    Object.assign(payment, {
      method: 'MOMO',
      provider: 'MOMO_SANDBOX',
      status: 'CANCELLED',
      merchantOrderId: 'old-order',
    });
    const ipn = {
      orderId: 'old-order',
      requestId: 'old-order',
      orderType: 'momo_wallet',
      amount: '92000',
      transId: '123',
      resultCode: 0,
    };
    await service.handleMomoIpn(ipn);
    await service.handleMomoIpn(ipn);
    expect(payment.status).toBe('CANCELLED');
    expect(payment.providerTransactionId).toBe('123');
    expect(payment.providerFinalizedAt).toBeTruthy();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(sales.confirmOnlinePayment).not.toHaveBeenCalled();
  });
});
