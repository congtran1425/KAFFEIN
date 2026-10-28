import { createHmac } from 'node:crypto';
import { MomoSandboxProvider } from './momo-sandbox.provider';

const secret = 'unit-test-secret';
const sign = (raw: string) =>
  createHmac('sha256', secret).update(raw).digest('hex');
const momoEnvKeys = [
  'MOMO_PARTNER_CODE',
  'MOMO_ACCESS_KEY',
  'MOMO_SECRET_KEY',
  'MOMO_IPN_URL',
  'MOMO_REDIRECT_URL',
] as const;
const previousMomoEnv = new Map(
  momoEnvKeys.map((key) => [key, process.env[key]]),
);

describe('MomoSandboxProvider', () => {
  let provider: MomoSandboxProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.MOMO_PARTNER_CODE = 'PARTNER_TEST';
    process.env.MOMO_ACCESS_KEY = 'ACCESS_TEST';
    process.env.MOMO_SECRET_KEY = secret;
    process.env.MOMO_IPN_URL = 'https://pos.example.test/api/v1/webhooks/momo';
    process.env.MOMO_REDIRECT_URL = 'https://pos.example.test/payment-result';
    provider = new MomoSandboxProvider();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    for (const key of momoEnvKeys) {
      const value = previousMomoEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.each([true, false])(
    'accepts a valid create response (signature present: %s)',
    async (signed) => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url, init) => {
          const request = JSON.parse(String(init?.body));
          const response = {
            partnerCode: request.partnerCode,
            requestId: request.requestId,
            orderId: request.orderId,
            amount: request.amount,
            responseTime: 1_760_000_000_000,
            message: 'Successful.',
            resultCode: 0,
            payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?token=sample',
            qrCodeUrl: 'sample-momo-qr-payload',
          };
          return new Response(
            JSON.stringify({
              ...response,
              ...(signed
                ? {
                    signature: sign(
                      `accessKey=ACCESS_TEST&amount=${response.amount}&message=${response.message}&orderId=${response.orderId}&partnerCode=${response.partnerCode}&payUrl=${response.payUrl}&requestId=${response.requestId}&responseTime=${response.responseTime}&resultCode=${response.resultCode}`,
                    ),
                  }
                : {}),
            }),
            { status: 200 },
          );
        });

      const result = await provider.createOrder({
        merchantOrderId: 'merchant-order-1',
        amountVnd: 25_000n,
        appTime: 1_760_000_000_000,
        description: 'Coffee order',
      });
      expect(result.qrCode).toBe('sample-momo-qr-payload');
      expect(result.orderUrl).toContain('test-payment.momo.vn');
      const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
      expect(request.requestType).toBe('captureWallet');
      expect(request.autoCapture).toBe(true);
    },
  );

  it('rejects an explicitly invalid create signature even though unsigned responses are supported', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            partnerCode: body.partnerCode,
            orderId: body.orderId,
            requestId: body.requestId,
            amount: body.amount,
            responseTime: 1760000000000,
            message: 'Successful.',
            resultCode: 0,
            payUrl: 'https://test-payment.momo.vn/pay',
            qrCodeUrl: 'qr',
            signature: '0'.repeat(64),
          }),
        );
      });
    await expect(
      provider.createOrder({
        merchantOrderId: 'test-order',
        amountVnd: 25000n,
        appTime: 1760000000000,
        description: 'Test',
      }),
    ).rejects.toThrow('Chữ ký tạo QR');
  });

  it('verifies IPN signatures and rejects altered amounts', () => {
    const data = {
      partnerCode: 'PARTNER_TEST',
      amount: 25_000,
      transId: 123456,
      responseTime: 1_760_000_000_000,
      resultCode: 0,
      extraData: '',
      message: 'Successful',
      orderId: 'merchant-order-1',
      orderInfo: 'Coffee order',
      orderType: 'momo_wallet',
      payType: 'qr',
      requestId: 'merchant-order-1',
    };
    const raw =
      'accessKey=ACCESS_TEST&amount=25000&extraData=&message=Successful&orderId=merchant-order-1&orderInfo=Coffee order&orderType=momo_wallet&partnerCode=PARTNER_TEST&payType=qr&requestId=merchant-order-1&responseTime=1760000000000&resultCode=0&transId=123456';
    expect(provider.verifyIpn({ ...data, signature: sign(raw) })).toBe(true);
    expect(
      provider.verifyIpn({ ...data, amount: 25_001, signature: sign(raw) }),
    ).toBe(false);
  });

  it('does not treat MoMo authorization result 9000 as paid', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        expect(request.signature).toBe(
          sign(
            `accessKey=ACCESS_TEST&orderId=merchant-order-1&partnerCode=PARTNER_TEST&requestId=${request.requestId}`,
          ),
        );
        return new Response(
          JSON.stringify({
            partnerCode: request.partnerCode,
            orderId: request.orderId,
            requestId: request.requestId,
            amount: 25_000,
            transId: 0,
            resultCode: 9000,
          }),
          { status: 200 },
        );
      });
    await expect(provider.queryOrder('merchant-order-1')).resolves.toEqual({
      state: 'WAITING',
    });
  });

  it.each([
    98, 99, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1017, 1026, 2019, 4001,
    4002, 4100,
  ])(
    'treats documented final-unpaid result %s as terminal',
    async (resultCode) => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url, init) => {
          const request = JSON.parse(String(init?.body));
          return new Response(
            JSON.stringify({
              partnerCode: request.partnerCode,
              orderId: request.orderId,
              requestId: request.requestId,
              amount: 25_000,
              transId: 0,
              resultCode,
            }),
            { status: 200 },
          );
        });
      await expect(provider.queryOrder('merchant-order-1')).resolves.toEqual({
        state: 'EXPIRED',
        amountVnd: 25_000n,
      });
    },
  );
});
