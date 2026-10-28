export type OnlinePaymentMethod = 'ZALOPAY' | 'MOMO';
export const ONLINE_PAYMENT_METHODS = ['ZALOPAY', 'MOMO'];
export interface OnlineOrder {
  qrCode: string;
  orderUrl: string;
  zpTransToken?: string;
}
export interface OnlineCreateInput {
  merchantOrderId: string;
  amountVnd: bigint;
  appTime: number;
  description: string;
  requestSnapshot?: Record<string, unknown>;
}
export interface OnlinePaymentProvider {
  assertConfigured(): void;
  prepareCreateRequest?(input: OnlineCreateInput): Record<string, unknown>;
  createOrder(input: OnlineCreateInput): Promise<OnlineOrder>;
  queryOrder(orderId: string): Promise<{
    state: 'PAID' | 'EXPIRED' | 'WAITING' | 'UNKNOWN';
    amountVnd?: bigint;
    providerTransactionId?: string;
  }>;
  cancelOrder(
    orderId: string,
  ): Promise<'CANCELLED' | 'ALREADY_PAID' | 'UNKNOWN'>;
}
