import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  OnlineCreateInput,
  OnlinePaymentProvider,
} from './online-payment-provider';

const FINAL_UNPAID_RESULT_CODES = new Set([
  98, 99, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1017, 1026, 2019, 4001,
  4002, 4100,
]);

/** Sandbox only. Never log signed requests, provider payloads or credentials. */
@Injectable()
export class MomoSandboxProvider implements OnlinePaymentProvider {
  private config() {
    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const accessKey = process.env.MOMO_ACCESS_KEY;
    const secretKey = process.env.MOMO_SECRET_KEY;
    const ipnUrl = process.env.MOMO_IPN_URL;
    const redirectUrl = process.env.MOMO_REDIRECT_URL;
    if (!partnerCode || !accessKey || !secretKey || !ipnUrl || !redirectUrl)
      throw new ServiceUnavailableException(
        'MoMo Sandbox chưa được cấu hình đầy đủ.',
      );
    for (const value of [ipnUrl, redirectUrl]) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new ServiceUnavailableException('URL MoMo không hợp lệ.');
      }
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new ServiceUnavailableException('URL MoMo phải dùng HTTPS.');
    }
    return { partnerCode, accessKey, secretKey, ipnUrl, redirectUrl };
  }
  assertConfigured() {
    this.config();
  }
  private sign(raw: string) {
    return createHmac('sha256', this.config().secretKey)
      .update(raw)
      .digest('hex');
  }
  private validSignature(raw: string, signature: unknown) {
    return (
      typeof signature === 'string' &&
      /^[a-f\d]{64}$/i.test(signature) &&
      timingSafeEqual(
        Buffer.from(this.sign(raw), 'hex'),
        Buffer.from(signature, 'hex'),
      )
    );
  }
  integer(value: unknown): string | null {
    if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return value;
    return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0
      ? String(value)
      : null;
  }
  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(
        `https://test-payment.momo.vn/v2/gateway/api/${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          // MoMo documents a 30s minimum; leave a small margin for network latency.
          signal: AbortSignal.timeout(35_000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('provider HTTP error');
      const raw = await response.text();
      if (raw.length > 262144) throw new Error('provider response too large');
      // Preserve 64-bit transaction IDs before JavaScript numeric parsing.
      const data: unknown = JSON.parse(
        raw.replace(/("transId"\s*:\s*)(\d+)(?=\s*[,}])/g, '$1"$2"'),
      );
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('invalid response');
      return data as Record<string, unknown>;
    } catch {
      throw new BadGatewayException(
        'Chưa xác định được kết quả MoMo. Cần đối soát cùng giao dịch.',
      );
    }
  }
  prepareCreateRequest(input: OnlineCreateInput): Record<string, unknown> {
    if (input.amountVnd < 1000n || input.amountVnd > 50_000_000n)
      throw new BadRequestException(
        'MoMo hỗ trợ số tiền từ 1.000 đến 50.000.000 đ.',
      );
    const { partnerCode, ipnUrl, redirectUrl } = this.config();
    const orderId = input.merchantOrderId,
      requestId = orderId,
      amount = Number(input.amountVnd);
    const orderInfo = input.description.slice(0, 200),
      extraData = '',
      requestType = 'captureWallet';
    return {
      partnerCode,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      lang: 'vi',
      requestType,
      autoCapture: true,
      extraData,
    };
  }
  async createOrder(input: OnlineCreateInput) {
    const body = input.requestSnapshot ?? this.prepareCreateRequest(input);
    const { partnerCode, accessKey } = this.config();
    if (
      body.partnerCode !== partnerCode ||
      body.orderId !== input.merchantOrderId ||
      body.requestId !== input.merchantOrderId ||
      this.integer(body.amount) !== input.amountVnd.toString() ||
      body.requestType !== 'captureWallet' ||
      body.autoCapture !== true ||
      typeof body.orderInfo !== 'string' ||
      typeof body.extraData !== 'string' ||
      typeof body.ipnUrl !== 'string' ||
      typeof body.redirectUrl !== 'string'
    ) {
      throw new ServiceUnavailableException(
        'MoMo request snapshot không khớp giao dịch. Cần đối soát.',
      );
    }
    const {
      extraData,
      ipnUrl,
      orderId,
      orderInfo,
      redirectUrl,
      requestId,
      requestType,
    } = body;
    const amount = input.amountVnd.toString();
    const signature = this.sign(
      `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`,
    );
    const data = await this.post('create', { ...body, signature });
    const responseTime = this.integer(data.responseTime);
    if (
      data.resultCode !== 0 ||
      data.partnerCode !== partnerCode ||
      data.orderId !== orderId ||
      data.requestId !== requestId ||
      this.integer(data.amount) !== String(amount) ||
      !responseTime ||
      typeof data.message !== 'string' ||
      typeof data.payUrl !== 'string' ||
      typeof data.qrCodeUrl !== 'string' ||
      !data.qrCodeUrl
    )
      throw new BadGatewayException(
        'Chưa nhận được QR MoMo hợp lệ. Cần đối soát cùng giao dịch.',
      );
    const payUrl = new URL(data.payUrl);
    if (
      payUrl.protocol !== 'https:' ||
      payUrl.hostname !== 'test-payment.momo.vn'
    )
      throw new BadGatewayException('URL thanh toán MoMo không hợp lệ.');
    // Sandbox captureWallet responses can omit signature (also omitted in the
    // official response example). The fixed HTTPS endpoint + identity checks
    // authenticate this create response; it never settles a payment. If a
    // signature is present, it must verify. IPN signatures remain mandatory.
    if (
      data.signature !== undefined &&
      !this.validSignature(
        `accessKey=${accessKey}&amount=${amount}&message=${data.message}&orderId=${orderId}&partnerCode=${partnerCode}&payUrl=${data.payUrl}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${data.resultCode}`,
        data.signature,
      )
    )
      throw new BadGatewayException('Chữ ký tạo QR MoMo không hợp lệ.');
    return { qrCode: data.qrCodeUrl, orderUrl: data.payUrl };
  }
  async queryOrder(
    orderId: string,
  ): ReturnType<OnlinePaymentProvider['queryOrder']> {
    const { partnerCode, accessKey } = this.config();
    const requestId = randomUUID();
    const signature = this.sign(
      `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`,
    );
    const data = await this.post('query', {
      partnerCode,
      requestId,
      orderId,
      signature,
      lang: 'vi',
    });
    const amount = this.integer(data.amount),
      transId = this.integer(data.transId);
    if (
      data.partnerCode !== partnerCode ||
      data.orderId !== orderId ||
      data.requestId !== requestId ||
      !amount ||
      !Number.isSafeInteger(data.resultCode)
    )
      return { state: 'UNKNOWN' };
    const resultCode = data.resultCode as number;
    if (resultCode === 0 && transId && BigInt(transId) > 0n)
      return {
        state: 'PAID',
        amountVnd: BigInt(amount),
        providerTransactionId: transId,
      };
    // Only MoMo's documented final transaction outcomes release the checkout.
    if (FINAL_UNPAID_RESULT_CODES.has(resultCode))
      return { state: 'EXPIRED', amountVnd: BigInt(amount) };
    return {
      state: [1000, 7000, 7002, 9000].includes(resultCode)
        ? 'WAITING'
        : 'UNKNOWN',
    };
  }
  async cancelOrder(_orderId: string): Promise<'UNKNOWN'> {
    void _orderId;
    // confirm/cancel cancels authorized holds, not an autoCapture pending QR.
    // The service queries the same order and waits for an authoritative final state.
    return 'UNKNOWN';
  }
  verifyIpn(data: Record<string, unknown>) {
    const { accessKey, partnerCode } = this.config();
    const amount = this.integer(data.amount),
      transId = this.integer(data.transId),
      responseTime = this.integer(data.responseTime);
    const keys = [
      'extraData',
      'message',
      'orderId',
      'orderInfo',
      'orderType',
      'payType',
      'requestId',
    ];
    if (
      data.partnerCode !== partnerCode ||
      !amount ||
      !transId ||
      !responseTime ||
      !Number.isSafeInteger(data.resultCode) ||
      keys.some((k) => typeof data[k] !== 'string')
    )
      return false;
    const extraData = data.extraData as string;
    const message = data.message as string;
    const orderId = data.orderId as string;
    const orderInfo = data.orderInfo as string;
    const orderType = data.orderType as string;
    const payType = data.payType as string;
    const requestId = data.requestId as string;
    const resultCode = data.resultCode as number;
    return this.validSignature(
      `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`,
      data.signature,
    );
  }
}
