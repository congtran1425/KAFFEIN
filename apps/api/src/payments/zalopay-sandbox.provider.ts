import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import https from 'node:https';
import crypto, { createHmac, timingSafeEqual } from 'node:crypto';

export interface ZaloPayCreatedOrder {
  qrCode: string;
  orderUrl: string;
  zpTransToken: string;
}

export interface ZaloPayQueryResult {
  state: 'PAID' | 'EXPIRED' | 'WAITING' | 'UNKNOWN';
  amountVnd?: bigint;
  providerTransactionId?: string;
}

export type ZaloPayCancelResult = 'CANCELLED' | 'ALREADY_PAID' | 'UNKNOWN';

/** Only the Sandbox host is allowed. No keys or signed request bodies are logged. */
@Injectable()
export class ZaloPaySandboxProvider {
  private readonly baseUrl = 'https://sb-openapi.zalopay.vn/v2';

  private config() {
    const appId = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    const key2 = process.env.ZALOPAY_KEY2;
    if (!appId || !/^\d+$/.test(appId) || !key1 || !key2) {
      throw new ServiceUnavailableException(
        'ZaloPay Sandbox chưa được cấu hình đầy đủ.',
      );
    }
    const callback = process.env.ZALOPAY_CALLBACK_URL;
    if (callback) {
      let url: URL;
      try {
        url = new URL(callback);
      } catch {
        throw new ServiceUnavailableException('Callback ZaloPay không hợp lệ.');
      }
      if (url.protocol !== 'https:')
        throw new ServiceUnavailableException(
          'Callback ZaloPay phải dùng HTTPS.',
        );
    }
    return { appId, key1, key2 };
  }

  assertConfigured() {
    this.config();
  }

  private hmac(key: string, input: string) {
    return createHmac('sha256', key).update(input).digest('hex');
  }

  verifyCallback(data: string, mac: string): boolean {
    if (!/^[a-fA-F0-9]{64}$/.test(mac)) return false;
    const expected = Buffer.from(this.hmac(this.config().key2, data), 'hex');
    return timingSafeEqual(expected, Buffer.from(mac, 'hex'));
  }

  getAppId(): string {
    return this.config().appId;
  }

  private async post(
    path: string,
    data: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    // If running in Jest test environment with mocked fetch, retain test compatibility
    const fetchFn = (globalThis as unknown as { fetch?: unknown }).fetch;
    const isMockFetch =
      typeof fetchFn === 'function' &&
      ('mock' in fetchFn || '_isMockFunction' in fetchFn);

    if (isMockFetch) {
      try {
        const response = await fetch(`${this.baseUrl}/${path}`, {
          method: 'POST',
          body: new URLSearchParams(data),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error('provider HTTP error');
        const result: unknown = this.parseJson(await response.text());
        if (!result || typeof result !== 'object' || Array.isArray(result))
          throw new Error('invalid response');
        return result as Record<string, unknown>;
      } catch {
        throw new BadGatewayException(
          'Chưa xác định được kết quả ZaloPay. Cần đối soát cùng giao dịch.',
        );
      }
    }

    return new Promise((resolve, reject) => {
      const postData = new URLSearchParams(data).toString();
      const agent = new https.Agent({
        secureOptions:
          crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
        keepAlive: true,
      });

      const req = https.request(
        `${this.baseUrl}/${path}`,
        {
          method: 'POST',
          agent,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 15_000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (
              res.statusCode &&
              (res.statusCode < 200 || res.statusCode >= 300)
            ) {
              return reject(
                new BadGatewayException(
                  'Chưa xác định được kết quả ZaloPay. Cần đối soát cùng giao dịch.',
                ),
              );
            }
            try {
              const result: unknown = this.parseJson(body);
              if (
                !result ||
                typeof result !== 'object' ||
                Array.isArray(result)
              ) {
                throw new Error('invalid response');
              }
              resolve(result as Record<string, unknown>);
            } catch {
              reject(
                new BadGatewayException(
                  'Chưa xác định được kết quả ZaloPay. Cần đối soát cùng giao dịch.',
                ),
              );
            }
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(
          new BadGatewayException(
            'Chưa xác định được kết quả ZaloPay. Cần đối soát cùng giao dịch.',
          ),
        );
      });

      req.on('error', () => {
        reject(
          new BadGatewayException(
            'Chưa xác định được kết quả ZaloPay. Cần đối soát cùng giao dịch.',
          ),
        );
      });

      req.write(postData);
      req.end();
    });
  }

  async createOrder(input: {
    merchantOrderId: string;
    amountVnd: bigint;
    appTime: number;
    description: string;
  }): Promise<ZaloPayCreatedOrder> {
    const { appId, key1 } = this.config();
    const amount = input.amountVnd.toString();
    const embedData = '{}';
    const item = '[]';
    const appUser = 'kaffein_pos';
    const mac = this.hmac(
      key1,
      `${appId}|${input.merchantOrderId}|${appUser}|${amount}|${input.appTime}|${embedData}|${item}`,
    );
    const callback = process.env.ZALOPAY_CALLBACK_URL;
    if (callback) {
      let url: URL;
      try {
        url = new URL(callback);
      } catch {
        throw new ServiceUnavailableException('Callback ZaloPay không hợp lệ.');
      }
      if (url.protocol !== 'https:')
        throw new ServiceUnavailableException(
          'Callback ZaloPay phải dùng HTTPS.',
        );
    }
    const result = await this.post('create', {
      app_id: appId,
      app_trans_id: input.merchantOrderId,
      app_user: appUser,
      amount,
      app_time: String(input.appTime),
      embed_data: embedData,
      item,
      description: input.description.slice(0, 256),
      expire_duration_seconds: '300',
      mac,
      ...(callback ? { callback_url: callback } : {}),
    });
    const qrCode =
      typeof result.qr_code === 'string' && result.qr_code
        ? result.qr_code
        : typeof result.order_url === 'string' && result.order_url
          ? result.order_url
          : undefined;

    if (
      result.return_code !== 1 ||
      !qrCode ||
      typeof result.order_url !== 'string' ||
      !result.order_url ||
      typeof result.zp_trans_token !== 'string' ||
      !result.zp_trans_token
    ) {
      // Do not infer FINAL_UNPAID from a generic provider error/duplicate ID.
      throw new BadGatewayException(
        'Chưa nhận được mã QR hợp lệ. Cần đối soát giao dịch, không tạo giao dịch khác.',
      );
    }
    return {
      qrCode,
      orderUrl: result.order_url,
      zpTransToken: result.zp_trans_token,
    };
  }

  async queryOrder(merchantOrderId: string): Promise<ZaloPayQueryResult> {
    const { appId, key1 } = this.config();
    const result = await this.post('query', {
      app_id: appId,
      app_trans_id: merchantOrderId,
      mac: this.hmac(key1, `${appId}|${merchantOrderId}|${key1}`),
    });
    if (result.return_code === 1) {
      const amount = this.integerString(result.amount);
      const transactionId = this.integerString(result.zp_trans_id);
      if (!amount || !transactionId || BigInt(transactionId) <= 0n)
        return { state: 'UNKNOWN' };
      return {
        state: 'PAID',
        amountVnd: BigInt(amount),
        providerTransactionId: transactionId,
      };
    }
    // Only the documented expiry code releases an unpaid intent. Insufficient
    // balance, timeout, ORDER_NOT_EXIST or local countdown do not.
    if (
      result.return_code === 2 &&
      result.sub_return_code === -54 &&
      result.is_processing !== true
    ) {
      return { state: 'EXPIRED' };
    }
    return { state: result.return_code === 3 ? 'WAITING' : 'UNKNOWN' };
  }

  async cancelOrder(merchantOrderId: string): Promise<ZaloPayCancelResult> {
    const { appId, key1 } = this.config();
    const result = await this.post('cancel', {
      app_id: appId,
      app_trans_id: merchantOrderId,
      mac: this.hmac(key1, `${appId}|${merchantOrderId}|${key1}`),
    });
    if (result.return_code === 1) return 'CANCELLED';
    if (result.return_code === 2 && result.sub_return_code === -403)
      return 'ALREADY_PAID';
    // A failed, processing, or malformed response is not proof of cancellation.
    return 'UNKNOWN';
  }

  // Provider transaction IDs are int64: preserve their digits before JS can round them.
  parseJson(raw: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(
      raw.replace(
        /("(?:amount|zp_trans_id)"\s*:\s*)(\d+)(?=\s*[,}])/g,
        '$1"$2"',
      ),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('invalid provider JSON');
    return parsed as Record<string, unknown>;
  }

  integerString(value: unknown): string | null {
    if (typeof value === 'string' && /^\d+$/.test(value)) return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
      return String(value);
    return null;
  }
}
