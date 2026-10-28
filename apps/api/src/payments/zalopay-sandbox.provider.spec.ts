import { createHmac } from 'node:crypto';
import { ZaloPaySandboxProvider } from './zalopay-sandbox.provider';

describe('ZaloPaySandboxProvider', () => {
  const saved = { ...process.env };
  let provider: ZaloPaySandboxProvider;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    process.env.ZALOPAY_APP_ID = '2553';
    process.env.ZALOPAY_KEY1 = 'unit-key-1';
    process.env.ZALOPAY_KEY2 = 'unit-key-2';
    delete process.env.ZALOPAY_CALLBACK_URL;
    provider = new ZaloPaySandboxProvider();
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...saved };
  });
  const reply = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

  it('sends Sandbox CreateOrder, 300 second expiry and correct HMAC', async () => {
    fetchMock.mockResolvedValue(
      reply({
        return_code: 1,
        qr_code: 'provider-qr',
        order_url: 'https://qcgateway.zalopay.vn/order',
        zp_trans_token: 'test-token',
      }),
    );
    const input = {
      merchantOrderId: '261010_test',
      amountVnd: 92000n,
      appTime: 1234,
      description: 'KAFFEIN',
    };
    const result = await provider.createOrder(input);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sb-openapi.zalopay.vn/v2/create');
    const data = request.body as URLSearchParams;
    expect(data.get('expire_duration_seconds')).toBe('300');
    expect(data.get('mac')).toBe(
      createHmac('sha256', 'unit-key-1')
        .update('2553|261010_test|kaffein_pos|92000|1234|{}|[]')
        .digest('hex'),
    );
    expect(result.qrCode).toBe('provider-qr');
  });

  it('falls back to order_url when qr_code is omitted by provider', async () => {
    fetchMock.mockResolvedValue(
      reply({
        return_code: 1,
        order_url: 'https://qcgateway.zalopay.vn/order',
        zp_trans_token: 'test-token',
      }),
    );
    const input = {
      merchantOrderId: '261010_test',
      amountVnd: 92000n,
      appTime: 1234,
      description: 'KAFFEIN',
    };
    const result = await provider.createOrder(input);
    expect(result.qrCode).toBe('https://qcgateway.zalopay.vn/order');
    expect(result.orderUrl).toBe('https://qcgateway.zalopay.vn/order');
    expect(result.zpTransToken).toBe('test-token');
  });

  it('fails closed when config is missing', async () => {
    delete process.env.ZALOPAY_KEY1;
    await expect(
      provider.createOrder({
        merchantOrderId: 'test',
        amountVnd: 1n,
        appTime: 1,
        description: 'test',
      }),
    ).rejects.toThrow('chưa được cấu hình');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never fabricates a QR after timeout or malformed response', async () => {
    const input = {
      merchantOrderId: 'test',
      amountVnd: 1n,
      appTime: 1,
      description: 'test',
    };
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(provider.createOrder(input)).rejects.toThrow('Chưa xác định');
    fetchMock.mockResolvedValueOnce(reply({ return_code: 1 }));
    await expect(provider.createOrder(input)).rejects.toThrow(
      'Chưa nhận được mã QR',
    );
  });

  it('refuses non-HTTPS callback', async () => {
    process.env.ZALOPAY_CALLBACK_URL = 'http://localhost/callback';
    await expect(
      provider.createOrder({
        merchantOrderId: 'test',
        amountVnd: 1n,
        appTime: 1,
        description: 'test',
      }),
    ).rejects.toThrow('HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates callback MAC without accepting malformed hex', () => {
    const data = '{"amount":92000}';
    const mac = createHmac('sha256', 'unit-key-2').update(data).digest('hex');
    expect(provider.verifyCallback(data, mac)).toBe(true);
    expect(provider.verifyCallback(data + ' ', mac)).toBe(false);
    expect(provider.verifyCallback(data, 'bad')).toBe(false);
  });

  it('maps only provider-confirmed expiry to EXPIRED', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ return_code: 2, sub_return_code: -54, is_processing: false }),
    );
    expect((await provider.queryOrder('test')).state).toBe('EXPIRED');
    for (const code of [-63, -101, -402, -500]) {
      fetchMock.mockResolvedValueOnce(
        reply({ return_code: 2, sub_return_code: code }),
      );
      expect((await provider.queryOrder('test')).state).toBe('UNKNOWN');
    }
    fetchMock.mockResolvedValueOnce(
      reply({ return_code: 2, sub_return_code: -54, is_processing: true }),
    );
    expect((await provider.queryOrder('test')).state).toBe('UNKNOWN');
  });

  it('queries using key1 and checks paid amount and provider ID', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ return_code: 1, amount: 92000, zp_trans_id: '9007199254740993' }),
    );
    const result = await provider.queryOrder('test');
    expect(result).toEqual({
      state: 'PAID',
      amountVnd: 92000n,
      providerTransactionId: '9007199254740993',
    });
    const data = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(data.get('mac')).toBe(
      createHmac('sha256', 'unit-key-1')
        .update('2553|test|unit-key-1')
        .digest('hex'),
    );
    expect(provider.integerString(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  it('sends CancelOrder with key1 and releases only on provider success', async () => {
    fetchMock.mockResolvedValueOnce(reply({ return_code: 1 }));
    expect(await provider.cancelOrder('261012_order')).toBe('CANCELLED');
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sb-openapi.zalopay.vn/v2/cancel');
    const data = request.body as URLSearchParams;
    expect(data.get('app_trans_id')).toBe('261012_order');
    expect(data.get('mac')).toBe(
      createHmac('sha256', 'unit-key-1')
        .update('2553|261012_order|unit-key-1')
        .digest('hex'),
    );
    fetchMock.mockResolvedValueOnce(
      reply({ return_code: 2, sub_return_code: -403 }),
    );
    expect(await provider.cancelOrder('261012_order')).toBe('ALREADY_PAID');
    for (const body of [
      { return_code: 3 },
      { return_code: 2, sub_return_code: -101 },
      {},
    ]) {
      fetchMock.mockResolvedValueOnce(reply(body));
      expect(await provider.cancelOrder('261012_order')).toBe('UNKNOWN');
    }
  });

  it('preserves unquoted int64 provider IDs without rounding', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        '{"return_code":1,"amount":92000,"zp_trans_id":9007199254740993}',
        { status: 200 },
      ),
    );
    expect((await provider.queryOrder('test')).providerTransactionId).toBe(
      '9007199254740993',
    );
  });
});
