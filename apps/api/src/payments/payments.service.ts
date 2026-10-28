import { MomoSandboxProvider } from './momo-sandbox.provider';
import {
  OnlinePaymentMethod,
  OnlinePaymentProvider,
  OnlineOrder,
  ONLINE_PAYMENT_METHODS,
} from './online-payment-provider';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Payment } from '../generated/prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { SalesService } from '../sales/sales.service';
import {
  CreateZaloPayOrderDto,
  CreateZaloPayOrderResponseDto,
  ZaloPayWebhookDto,
  InitiateZaloPayDto,
} from './dto/zalopay.dto';
import { ZaloPaySandboxProvider } from './zalopay-sandbox.provider';
import {
  lockStoreCheckout,
  assertNoPendingOnlinePayment,
} from '../common/payment-store-lock';

const QR_DISPLAY_TIMEOUT_SECONDS = 300;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly manualChecks = new Map<
    string,
    Promise<Awaited<ReturnType<PaymentsService['getAttempt']>>>
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly provider: ZaloPaySandboxProvider,
    @Optional() private readonly momo?: MomoSandboxProvider,
  ) {}

  private adapter(method: string): OnlinePaymentProvider {
    if (method === 'ZALOPAY') return this.provider;
    if (method === 'MOMO' && this.momo) return this.momo;
    throw new ServiceUnavailableException(
      'Cổng thanh toán chưa được cấu hình.',
    );
  }

  onlineCapabilities() {
    return {
      providers: {
        ZALOPAY: this.capabilities('ZALOPAY'),
        MOMO: this.capabilities('MOMO'),
      },
    };
  }

  capabilities(method: OnlinePaymentMethod = 'ZALOPAY') {
    try {
      this.adapter(method).assertConfigured();
      return {
        available: true,
        expiresInSeconds: QR_DISPLAY_TIMEOUT_SECONDS,
        confirmationMode:
          method === 'MOMO' ? 'QUERY_WITH_OPTIONAL_IPN' : 'CALLBACK_WITH_QUERY',
        canCancelPending: true,
        cancellationMode: method === 'MOMO' ? 'LOCAL' : 'PROVIDER',
      };
    } catch {
      return {
        available: false,
        expiresInSeconds: QR_DISPLAY_TIMEOUT_SECONDS,
      };
    }
  }

  async initiate(
    storeId: bigint,
    deviceId: string,
    dto: InitiateZaloPayDto,
    method: OnlinePaymentMethod = 'ZALOPAY',
  ) {
    const adapter = this.adapter(method);
    adapter.assertConfigured();
    if (
      method === 'MOMO' &&
      (dto.expectedTotalVnd < 1000 || dto.expectedTotalVnd > 50_000_000)
    )
      throw new BadRequestException(
        'MoMo hỗ trợ số tiền từ 1.000 đến 50.000.000 đ.',
      );
    const items = dto.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
      quantity: item.quantity,
      note: item.note ?? '',
      toppings: (item.toppings ?? []).map((t) => ({
        toppingId: t.toppingId,
        quantityPerItem: t.quantityPerItem ?? 1,
      })),
    }));
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          storeId: storeId.toString(),
          deviceId,
          ...(method === 'MOMO' ? { method } : {}),
          registerSessionId: dto.registerSessionId,
          total: dto.expectedTotalVnd,
          items,
        }),
      )
      .digest('hex');
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockStoreCheckout(tx, storeId);
        const rejection = await tx.checkoutRejection.findUnique({
          where: { saleId: dto.saleId },
        });
        if (rejection)
          throw new ConflictException(
            'CHECKOUT_REJECTED: Attempt đã bị từ chối trước khi tạo QR.',
          );
        const existing = await tx.sale.findUnique({
          where: { id: dto.saleId },
          include: { payments: true },
        });
        if (existing) {
          if (existing.storeId !== storeId || existing.deviceId !== deviceId)
            throw new ForbiddenException(
              'Attempt thuộc thiết bị/chi nhánh khác.',
            );
          if (
            existing.payments.length !== 1 ||
            existing.payments[0].checkoutRequestHash !== hash ||
            existing.payments[0].method !== method
          ) {
            throw new ConflictException(
              'Idempotency key đã dùng cho giỏ hàng khác.',
            );
          }
          return;
        }
        await assertNoPendingOnlinePayment(tx, storeId);
        const device = await tx.device.findUnique({ where: { id: deviceId } });
        if (
          !device ||
          device.status !== 'ACTIVE' ||
          device.storeId !== storeId ||
          !device.lastSyncedAt ||
          device.hasPendingOutbox ||
          device.outboxPendingCount !== 0
        ) {
          throw new ConflictException(
            'Cần đồng bộ toàn bộ Outbox trước khi thanh toán online.',
          );
        }
        const cashier = await tx.cashierSession.findFirst({
          where: { deviceId, status: 'ACTIVE' },
          include: { user: true },
          orderBy: { startedAt: 'desc' },
        });
        if (
          !cashier ||
          cashier.user.status !== 'ACTIVE' ||
          cashier.user.homeStoreId !== storeId
        ) {
          throw new ForbiddenException(
            'Cần phiên thu ngân hợp lệ tại home store.',
          );
        }
        const register = await tx.registerSession.findUnique({
          where: { id: dto.registerSessionId },
        });
        if (
          !register ||
          register.storeId !== storeId ||
          register.deviceId !== deviceId ||
          register.status !== 'OPEN'
        ) {
          throw new ConflictException(
            'Cần phiên quỹ đã đồng bộ và đang mở trên thiết bị.',
          );
        }
        // Allow only identifiers/quantities. No client cashier, price, tax, recipe or consumption override.
        const sale = await this.salesService.completeSaleInsideTx(
          tx,
          storeId,
          deviceId,
          {
            id: dto.saleId,
            registerSessionId: dto.registerSessionId,
            items,
            payment: { method, amountVnd: dto.expectedTotalVnd },
          },
        );
        if (BigInt(sale.totalVnd) !== BigInt(dto.expectedTotalVnd)) {
          throw new ConflictException(
            'PRICE_CHANGED: Giá server không khớp giỏ hàng; hãy rà lại đơn.',
          );
        }
        const lines = await tx.saleItem.findMany({
          where: { saleId: sale.id },
          include: { consumptions: true },
        });
        const needed = new Map<bigint, Prisma.Decimal>();
        for (const line of lines)
          for (const c of line.consumptions) {
            needed.set(
              c.ingredientId,
              (needed.get(c.ingredientId) ?? new Prisma.Decimal(0)).add(
                c.quantityTotal,
              ),
            );
          }
        for (const [ingredientId, quantity] of needed) {
          const stock = await tx.stockBalance.findUnique({
            where: { storeId_ingredientId: { storeId, ingredientId } },
          });
          if (!stock || stock.quantity.lt(quantity))
            throw new ConflictException('Tồn nguyên liệu không đủ để tạo QR.');
        }
        await tx.payment.updateMany({
          where: { saleId: sale.id, method },
          data: { checkoutRequestHash: hash },
        });
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        await this.prisma.$transaction(async (tx) => {
          await lockStoreCheckout(tx, storeId);
          // A concurrent accepted request wins; never label its intent unpaid.
          if (await tx.sale.findUnique({ where: { id: dto.saleId } })) return;
          await tx.checkoutRejection.upsert({
            where: { saleId: dto.saleId },
            update: {},
            create: {
              saleId: dto.saleId,
              storeId,
              deviceId,
              requestHash: hash,
              amountVnd: BigInt(dto.expectedTotalVnd),
            },
          });
        });
      }
      throw error;
    }
    return this.createOnlineOrder(
      storeId,
      { saleId: dto.saleId, amountVnd: dto.expectedTotalVnd },
      deviceId,
      method,
    );
  }

  async getPendingForDevice(storeId: bigint, deviceId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        storeId,
        method: { in: ONLINE_PAYMENT_METHODS },
        status: 'PENDING',
        sale: { deviceId },
      },
      orderBy: { createdAt: 'asc' },
    });
    return payment ? this.getPaymentStatus(payment.id, storeId) : null;
  }

  async getAttempt(
    storeId: bigint,
    deviceId: string,
    saleId: string,
    queryProvider = true,
    refreshProvider = false,
  ) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale) {
      const rejected = await this.prisma.checkoutRejection.findUnique({
        where: { saleId },
      });
      if (!rejected)
        throw new NotFoundException('Attempt chưa có trên server.');
      if (rejected.storeId !== storeId || rejected.deviceId !== deviceId)
        throw new ForbiddenException('Attempt không thuộc máy POS này.');
      return {
        id: null,
        saleId,
        amountVnd: rejected.amountVnd.toString(),
        checkoutState: 'FINAL_UNPAID',
        status: 'REJECTED',
        canSubmit: false,
        qrCode: undefined,
        orderUrl: undefined,
      };
    }
    if (sale.storeId !== storeId || sale.deviceId !== deviceId)
      throw new ForbiddenException('Attempt không thuộc máy POS này.');
    if (
      sale.payments.length !== 1 ||
      !ONLINE_PAYMENT_METHODS.includes(sale.payments[0].method) ||
      sale.payments[0].provider !== `${sale.payments[0].method}_SANDBOX`
    ) {
      throw new ConflictException(
        'Attempt cần kiểm tra payment trùng/khác phương thức.',
      );
    }
    const status = await this.getPaymentStatus(
      sale.payments[0].id,
      storeId,
      queryProvider,
      refreshProvider,
    );
    const fresh = await this.prisma.payment.findUnique({
      where: { id: status.id },
    });
    const qr =
      status.checkoutState === 'WAITING'
        ? (fresh?.providerOrderJson as OnlineOrder | null)
        : null;
    return {
      ...status,
      method: fresh?.method ?? sale.payments[0].method,
      canSubmit:
        fresh?.status === 'PENDING' &&
        !fresh.createRequestedAt &&
        !fresh.providerConfirmedAt,
      ...(qr ? { qrCode: qr.qrCode, orderUrl: qr.orderUrl } : {}),
    };
  }

  async checkAttempt(storeId: bigint, deviceId: string, saleId: string) {
    // Scope must be checked before joining any in-flight manual request.
    const current = await this.getAttempt(storeId, deviceId, saleId, false);
    if (
      !('method' in current) ||
      current.method !== 'ZALOPAY' ||
      current.checkoutState === 'PAID' ||
      current.checkoutState === 'FINAL_UNPAID' ||
      current.checkoutState === 'CANCELLED'
    ) {
      return current;
    }
    const running = this.manualChecks.get(saleId);
    if (running) return running;
    const checking = this.getAttempt(storeId, deviceId, saleId, true, true);
    this.manualChecks.set(saleId, checking);
    try {
      return await checking;
    } finally {
      if (this.manualChecks.get(saleId) === checking)
        this.manualChecks.delete(saleId);
    }
  }

  private response(payment: Payment): CreateZaloPayOrderResponseDto {
    const order = payment.providerOrderJson as OnlineOrder | null;
    if (
      !order?.qrCode ||
      !order.orderUrl ||
      !payment.expiresAt ||
      !payment.merchantOrderId
    ) {
      throw new ConflictException(
        'PAYMENT_RECONCILIATION_REQUIRED: Chưa có QR được xác nhận; cần đối soát cùng payment.',
      );
    }
    return {
      paymentId: payment.id,
      saleId: payment.saleId,
      method: payment.method as OnlinePaymentMethod,
      merchantOrderId: payment.merchantOrderId,
      amountVnd: payment.amountVnd.toString(),
      expiresAt: payment.expiresAt.toISOString(),
      ...order,
    };
  }

  /** Reuses the payment created by SalesService. Never generates a second payment. */
  async createOnlineOrder(
    storeId: bigint,
    dto: CreateZaloPayOrderDto,
    deviceId: string,
    method: OnlinePaymentMethod = 'ZALOPAY',
  ): Promise<CreateZaloPayOrderResponseDto> {
    const adapter = this.adapter(method);
    adapter.assertConfigured();
    const claimed = await this.prisma.$transaction(async (tx) => {
      await lockStoreCheckout(tx, storeId);
      await assertNoPendingOnlinePayment(tx, storeId, dto.saleId);
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${dto.saleId}::uuid FOR UPDATE`;
      const sale = await tx.sale.findUnique({
        where: { id: dto.saleId },
        include: { payments: true },
      });
      if (!sale) throw new NotFoundException('Không tìm thấy đơn hàng.');
      if (sale.storeId !== storeId || sale.deviceId !== deviceId)
        throw new ForbiddenException('Đơn không thuộc máy POS/chi nhánh này.');
      if (
        sale.status !== 'PAYMENT_PENDING' ||
        !Number.isSafeInteger(dto.amountVnd) ||
        dto.amountVnd <= 0 ||
        BigInt(dto.amountVnd) !== sale.totalVnd
      ) {
        throw new BadRequestException(
          'Đơn không ở trạng thái chờ hoặc số tiền không khớp.',
        );
      }
      if (
        sale.payments.length !== 1 ||
        sale.payments[0].method !== method ||
        sale.payments[0].provider !== `${method}_SANDBOX`
      ) {
        throw new ConflictException(
          'Đơn phải có đúng một payment đúng cổng Sandbox.',
        );
      }
      const payment = sale.payments[0];
      if (!payment.checkoutRequestHash)
        throw new ConflictException(
          'Đơn cũ chưa có checkout intent được server xác thực.',
        );
      if (
        payment.storeId !== storeId ||
        payment.amountVnd !== sale.totalVnd ||
        payment.status !== 'PENDING' ||
        payment.providerConfirmedAt
      )
        throw new ConflictException(
          'Giao dịch cần đối soát, không được tạo lại.',
        );
      if (payment.providerOrderJson) {
        if (!payment.expiresAt || payment.expiresAt.getTime() <= Date.now()) {
          throw new ConflictException(
            'QR hết thời gian hiển thị. Cần tra cứu trạng thái payment.',
          );
        }
        return { payment, shouldCreate: false };
      }
      const now = new Date();
      const retryMomo =
        method === 'MOMO' &&
        payment.providerCreateRequestJson &&
        payment.createRequestedAt &&
        payment.expiresAt &&
        payment.expiresAt > now &&
        (payment.createAttemptCount ?? 0) < 3 &&
        (!payment.createLeaseUntil || payment.createLeaseUntil <= now);
      if (payment.createRequestedAt && !retryMomo)
        throw new ConflictException(
          'PAYMENT_RECONCILIATION_REQUIRED: Yêu cầu đã gửi; không tạo lại QR.',
        );
      const cashier = await tx.cashierSession.findFirst({
        where: { deviceId, status: 'ACTIVE' },
        include: { user: true },
        orderBy: { startedAt: 'desc' },
      });
      if (
        !cashier ||
        cashier.userId !== sale.cashierUserId ||
        cashier.user.status !== 'ACTIVE' ||
        cashier.user.homeStoreId !== storeId
      )
        throw new ForbiddenException(
          'Cần phiên thu ngân hợp lệ tại chi nhánh.',
        );
      const date = this.salesService
        .getBusinessDate(now)
        .toISOString()
        .slice(2, 10)
        .replace(/-/g, '');
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          merchantOrderId:
            payment.merchantOrderId ??
            `${date}_${payment.id.replace(/-/g, '')}`,
          createRequestedAt: payment.createRequestedAt ?? now,
          expiresAt:
            payment.expiresAt ??
            new Date(now.getTime() + QR_DISPLAY_TIMEOUT_SECONDS * 1000),
          ...(method === 'MOMO'
            ? {
                createLeaseUntil: new Date(now.getTime() + 60_000),
                createAttemptCount: (payment.createAttemptCount ?? 0) + 1,
                providerCreateRequestJson: (payment.providerCreateRequestJson ??
                  adapter.prepareCreateRequest!({
                    merchantOrderId:
                      payment.merchantOrderId ??
                      `${date}_${payment.id.replace(/-/g, '')}`,
                    amountVnd: payment.amountVnd,
                    appTime: now.getTime(),
                    description:
                      dto.description || 'KAFFEIN - thanh toán tại quầy',
                  })) as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      return { payment: updated, shouldCreate: true };
    });
    if (!claimed.shouldCreate) return this.response(claimed.payment);
    // Deliberately outside the transaction. A timeout retains the claimed intent.
    const order = await adapter.createOrder({
      merchantOrderId: claimed.payment.merchantOrderId!,
      amountVnd: claimed.payment.amountVnd,
      appTime: claimed.payment.createRequestedAt!.getTime(),
      description: dto.description || 'KAFFEIN - thanh toán tại quầy',
      ...(method === 'MOMO'
        ? {
            requestSnapshot: claimed.payment
              .providerCreateRequestJson as Record<string, unknown>,
          }
        : {}),
    });
    const payment = await this.prisma.payment.update({
      where: { id: claimed.payment.id },
      data: { providerOrderJson: order as unknown as Prisma.InputJsonValue },
    });
    if (payment.status !== 'PENDING') {
      throw new ConflictException(
        'PAYMENT_ENDED: Đọc lại attempt; không hiển thị QR của yêu cầu đã kết thúc.',
      );
    }
    return this.response(payment);
  }

  /** Runs without a POS connection. No order IDs are generated for legacy attempts. */
  async reconcilePendingMomo(storeId?: bigint): Promise<void> {
    const pending = await this.prisma.payment.findMany({
      where: {
        method: 'MOMO',
        provider: 'MOMO_SANDBOX',
        ...(storeId === undefined ? {} : { storeId }),
        AND: [
          {
            OR: [
              {
                status: 'PENDING',
                createRequestedAt: { not: null },
                merchantOrderId: { not: null },
              },
              {
                status: 'CANCELLED',
                createRequestedAt: { not: null },
                merchantOrderId: { not: null },
                providerFinalizedAt: null,
              },
              {
                status: { notIn: ['PAID', 'CANCELLED'] },
                providerConfirmedAt: { not: null },
              },
            ],
          },
          {
            OR: [
              { lastQueriedAt: null },
              { lastQueriedAt: { lt: new Date(Date.now() - 60_000) } },
            ],
          },
        ],
      },
      orderBy: [
        { lastQueriedAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
      take: 5,
      include: { sale: { select: { deviceId: true } } },
    });
    const results = await Promise.allSettled(
      pending.map(async (candidate) => {
        const status = await this.getPaymentStatus(
          candidate.id,
          candidate.storeId,
        );
        if (status.status !== 'PENDING') return;
        const fresh = await this.prisma.payment.findUnique({
          where: { id: candidate.id },
        });
        if (
          !fresh ||
          fresh.providerConfirmedAt ||
          fresh.providerOrderJson ||
          !fresh.providerCreateRequestJson ||
          !fresh.createRequestedAt ||
          !fresh.expiresAt ||
          fresh.expiresAt.getTime() <= Date.now() ||
          (fresh.createAttemptCount ?? 0) >= 3 ||
          (fresh.createLeaseUntil &&
            fresh.createLeaseUntil.getTime() > Date.now())
        )
          return;
        // Same persisted request only; a lost response must never become a new checkout.
        await this.createOnlineOrder(
          candidate.storeId,
          { saleId: candidate.saleId, amountVnd: Number(candidate.amountVnd) },
          candidate.sale.deviceId,
          'MOMO',
        );
      }),
    );
    const deferred = results.filter(
      (result) => result.status === 'rejected',
    ).length;
    if (deferred > 0)
      this.logger.warn(
        `MoMo background reconciliation deferred for ${deferred} payment(s).`,
      );
  }

  async createZaloPayOrder(
    storeId: bigint,
    dto: CreateZaloPayOrderDto,
    deviceId: string,
  ) {
    return this.createOnlineOrder(storeId, dto, deviceId, 'ZALOPAY');
  }

  private async recordConfirmation(
    paymentId: string,
    providerTransactionId: string,
  ) {
    // Serialize evidence vs local cancellation. Evidence commits before settlement
    // so inventory errors cannot erase a receipt of money.
    const reference = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!reference) throw new NotFoundException('Không tìm thấy payment.');
    const cancelled = await this.prisma.$transaction(async (tx) => {
      await lockStoreCheckout(tx, reference.storeId);
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${reference.saleId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const current = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!current) throw new NotFoundException('Không tìm thấy payment.');
      const firstLateReceipt =
        current.status === 'CANCELLED' && !current.providerConfirmedAt;
      const marked = await tx.payment.updateMany({
        where: {
          id: paymentId,
          method: { in: ONLINE_PAYMENT_METHODS },
          OR: [{ providerTransactionId: null }, { providerTransactionId }],
        },
        data: {
          providerConfirmedAt: current.providerConfirmedAt ?? new Date(),
          providerTransactionId,
          ...(current.status === 'CANCELLED'
            ? { providerFinalizedAt: new Date() }
            : {}),
        },
      });
      if (marked.count !== 1)
        throw new ConflictException('Provider transaction không khớp payment.');
      if (firstLateReceipt) {
        await tx.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            storeId: current.storeId,
            action: 'PAYMENT_RECEIVED_AFTER_CANCEL',
            entityType: 'payment',
            entityId: paymentId,
            metadata: {
              saleId: current.saleId,
              amountVnd: current.amountVnd.toString(),
              providerTransactionId,
            },
          },
        });
      }
      return current.status === 'CANCELLED';
    });
    if (cancelled) return;
    await this.prisma.$transaction(async (tx) => {
      await this.salesService.confirmOnlinePayment(
        tx,
        paymentId,
        providerTransactionId,
      );
    });
  }

  async handleWebhook(
    dto: ZaloPayWebhookDto,
  ): Promise<{ return_code: number; return_message: string }> {
    if (
      (dto.type !== undefined && dto.type !== 1) ||
      !this.provider.verifyCallback(dto.data, dto.mac)
    ) {
      return { return_code: 2, return_message: 'invalid callback' };
    }
    try {
      const data = this.provider.parseJson(dto.data);
      const appId = this.provider.integerString(data.app_id);
      const amount = this.provider.integerString(data.amount);
      const providerId = this.provider.integerString(data.zp_trans_id);
      if (
        appId !== this.provider.getAppId() ||
        !amount ||
        !providerId ||
        BigInt(providerId) <= 0n ||
        typeof data.app_trans_id !== 'string'
      )
        return { return_code: 2, return_message: 'invalid callback data' };
      const payment = await this.prisma.payment.findUnique({
        where: { merchantOrderId: data.app_trans_id },
      });
      if (
        !payment ||
        payment.method !== 'ZALOPAY' ||
        payment.provider !== 'ZALOPAY_SANDBOX' ||
        payment.amountVnd !== BigInt(amount) ||
        (payment.providerTransactionId &&
          payment.providerTransactionId !== providerId)
      ) {
        return { return_code: 2, return_message: 'payment mismatch' };
      }
      if (payment.status !== 'PAID')
        await this.recordConfirmation(payment.id, providerId);
      return { return_code: 1, return_message: 'success' };
    } catch {
      // Never echo provider payload, MAC or a database exception.
      this.logger.error('ZaloPay callback requires reconciliation.');
      return { return_code: 0, return_message: 'reconciliation required' };
    }
  }

  async handleMomoIpn(dto: Record<string, unknown>) {
    if (!this.momo || !this.momo.verifyIpn(dto))
      throw new UnauthorizedException('Invalid MoMo signature.');
    const payment = await this.prisma.payment.findUnique({
      where: { merchantOrderId: String(dto.orderId) },
    });
    const amount = this.momo.integer(dto.amount),
      transId = this.momo.integer(dto.transId);
    if (
      !payment ||
      payment.method !== 'MOMO' ||
      payment.provider !== 'MOMO_SANDBOX' ||
      dto.orderType !== 'momo_wallet' ||
      dto.requestId !== payment.merchantOrderId ||
      !amount ||
      BigInt(amount) !== payment.amountVnd ||
      (payment.providerTransactionId &&
        payment.providerTransactionId !== transId)
    )
      throw new BadRequestException('MoMo payment mismatch.');
    if (payment.status === 'PAID') return;
    // Non-success IPN is not sufficient to release the cart; query confirms final-unpaid.
    if (dto.resultCode === 0) {
      if (!transId || BigInt(transId) <= 0n)
        throw new BadRequestException('Invalid MoMo transaction.');
      if (payment.status !== 'PAID')
        await this.recordConfirmation(payment.id, transId);
    }
  }

  async getPaymentStatus(
    paymentId: string,
    requestingStoreId?: bigint,
    queryProvider = true,
    refreshProvider = false,
  ) {
    let payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch.');
    const refreshZaloPay = refreshProvider && payment.method === 'ZALOPAY';
    let refreshFailed = false;
    if (
      requestingStoreId !== undefined &&
      payment.storeId !== requestingStoreId
    ) {
      throw new ForbiddenException(
        'Không có quyền xem giao dịch của chi nhánh khác.',
      );
    }
    if (
      queryProvider &&
      ONLINE_PAYMENT_METHODS.includes(payment.method) &&
      payment.status !== 'PAID'
    ) {
      try {
        if (payment.status === 'CANCELLED') {
          if (
            payment.method === 'MOMO' &&
            payment.createRequestedAt &&
            payment.merchantOrderId &&
            !payment.providerFinalizedAt
          ) {
            const lease = await this.prisma.payment.updateMany({
              where: {
                id: payment.id,
                status: 'CANCELLED',
                providerFinalizedAt: null,
                OR: [
                  { lastQueriedAt: null },
                  { lastQueriedAt: { lt: new Date(Date.now() - 60_000) } },
                ],
              },
              data: { lastQueriedAt: new Date() },
            });
            if (lease.count === 1) {
              const result = await this.adapter(payment.method).queryOrder(
                payment.merchantOrderId,
              );
              if (
                result.state === 'PAID' &&
                result.amountVnd === payment.amountVnd &&
                result.providerTransactionId
              ) {
                await this.recordConfirmation(
                  payment.id,
                  result.providerTransactionId,
                );
              } else if (
                result.state === 'EXPIRED' &&
                result.amountVnd === payment.amountVnd
              ) {
                await this.prisma.payment.updateMany({
                  where: {
                    id: payment.id,
                    status: 'CANCELLED',
                    providerFinalizedAt: null,
                  },
                  data: { providerFinalizedAt: new Date() },
                });
              }
            }
          }
        } else if (
          payment.providerConfirmedAt &&
          payment.providerTransactionId
        ) {
          const lease = await this.prisma.payment.updateMany({
            where: {
              id: payment.id,
              status: { not: 'PAID' },
              ...(!refreshZaloPay && {
                OR: [
                  { lastQueriedAt: null },
                  { lastQueriedAt: { lt: new Date(Date.now() - 60_000) } },
                ],
              }),
            },
            data: { lastQueriedAt: new Date() },
          });
          if (lease.count === 1)
            await this.recordConfirmation(
              payment.id,
              payment.providerTransactionId,
            );
        } else if (
          payment.status === 'PENDING' &&
          payment.createRequestedAt &&
          payment.merchantOrderId
        ) {
          // Automatic polls share the persistent 60s lease. An explicit ZaloPay
          // check bypasses that cache; duplicate manual checks join checkAttempt.
          const lease = await this.prisma.payment.updateMany({
            where: {
              id: payment.id,
              status: 'PENDING',
              providerConfirmedAt: null,
              ...(!refreshZaloPay && {
                OR: [
                  { lastQueriedAt: null },
                  { lastQueriedAt: { lt: new Date(Date.now() - 60_000) } },
                ],
              }),
            },
            data: { lastQueriedAt: new Date() },
          });
          if (lease.count === 1) {
            const result = await this.adapter(payment.method).queryOrder(
              payment.merchantOrderId,
            );
            if (
              refreshZaloPay &&
              (result.state === 'UNKNOWN' ||
                (result.state === 'PAID' &&
                  (result.amountVnd !== payment.amountVnd ||
                    !result.providerTransactionId)))
            )
              throw new ServiceUnavailableException(
                'Chưa xác minh được kết quả ZaloPay.',
              );
            if (
              result.state === 'PAID' &&
              result.amountVnd === payment.amountVnd &&
              result.providerTransactionId
            ) {
              await this.recordConfirmation(
                payment.id,
                result.providerTransactionId,
              );
            } else if (
              result.state === 'EXPIRED' &&
              (payment.method === 'ZALOPAY' ||
                result.amountVnd === payment.amountVnd)
            ) {
              const id = payment.id,
                saleId = payment.saleId;
              await this.prisma.$transaction(async (tx) => {
                await lockStoreCheckout(tx, payment!.storeId);
                // Same order as PAID settlement: sale, payment, then sorted inventory.
                await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId}::uuid FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
                const expired = await tx.payment.updateMany({
                  where: { id, status: 'PENDING', providerConfirmedAt: null },
                  data: { status: 'EXPIRED' },
                });
                if (expired.count === 1)
                  await tx.sale.updateMany({
                    where: { id: saleId, status: 'PAYMENT_PENDING' },
                    data: { status: 'EXPIRED' },
                  });
              });
            }
          }
        }
      } catch {
        refreshFailed = true;
        // Still PENDING/confirmed: never release the cart on timeout/failed settlement.
        this.logger.warn('Online payment status remains unresolved.');
      }
      payment = (await this.prisma.payment.findUnique({
        where: { id: paymentId },
      }))!;
    }
    if (refreshZaloPay && refreshFailed && payment.status !== 'PAID')
      throw new ServiceUnavailableException(
        payment.providerConfirmedAt
          ? 'Đã nhận tiền. Đang đối soát biên lai và kho, không thu thêm tiền.'
          : 'Chưa tra cứu được ZaloPay. Giữ nguyên giao dịch và kiểm tra lại.',
      );
    return {
      id: payment.id,
      saleId: payment.saleId,
      storeId: payment.storeId.toString(),
      method: payment.method,
      provider: payment.provider,
      status: payment.status,
      checkoutState:
        payment.status === 'CANCELLED'
          ? 'CANCELLED'
          : payment.status === 'PAID'
            ? 'PAID'
            : payment.status === 'EXPIRED' && !payment.providerConfirmedAt
              ? 'FINAL_UNPAID'
              : payment.providerConfirmedAt ||
                  !payment.providerOrderJson ||
                  !payment.expiresAt ||
                  payment.expiresAt.getTime() <= Date.now()
                ? 'RECONCILING'
                : 'WAITING',
      amountVnd: payment.amountVnd.toString(),
      merchantOrderId: payment.merchantOrderId,
      providerTransactionId: payment.providerTransactionId,
      paidAt: payment.paidAt?.toISOString(),
      expiresAt: payment.expiresAt?.toISOString(),
      lastQueriedAt: payment.lastQueriedAt?.toISOString(),
      cancelledAt: payment.cancelledAt?.toISOString(),
      providerFinalizedAt: payment.providerFinalizedAt?.toISOString(),
      requiresReconciliation:
        payment.status === 'CANCELLED' && !!payment.providerConfirmedAt,
      nextQueryAt:
        (payment.status === 'PENDING' ||
          (payment.status === 'CANCELLED' && !payment.providerFinalizedAt)) &&
        payment.lastQueriedAt
          ? new Date(payment.lastQueriedAt.getTime() + 60_000).toISOString()
          : null,
      confirmationMode:
        payment.method === 'MOMO'
          ? 'QUERY_WITH_OPTIONAL_IPN'
          : 'CALLBACK_WITH_QUERY',
      canCancelPending:
        payment.status === 'PENDING' && !payment.providerConfirmedAt,
      cancellationMode: payment.method === 'MOMO' ? 'LOCAL' : 'PROVIDER',
      reconciliationOverdue:
        payment.status !== 'PAID' &&
        payment.status !== 'EXPIRED' &&
        payment.status !== 'CANCELLED' &&
        !!payment.createRequestedAt &&
        Date.now() - payment.createRequestedAt.getTime() > 900_000,
    };
  }

  async cancelledReceipts(storeId?: bigint) {
    const where = {
      status: 'CANCELLED',
      providerConfirmedAt: { not: null },
      ...(storeId === undefined ? {} : { storeId }),
    };
    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        take: 100,
        orderBy: [{ providerConfirmedAt: 'desc' }, { id: 'desc' }],
        include: {
          sale: {
            select: { saleNumber: true, store: { select: { name: true } } },
          },
        },
      }),
    ]);
    return {
      total,
      items: payments.map((p) => ({
        id: p.id,
        saleId: p.saleId,
        saleNumber: p.sale.saleNumber,
        storeId: p.storeId.toString(),
        storeName: p.sale.store.name,
        method: p.method,
        amountVnd: p.amountVnd.toString(),
        merchantOrderId: p.merchantOrderId,
        providerTransactionId: p.providerTransactionId,
        cancelledAt: p.cancelledAt?.toISOString(),
        receivedAt: p.providerConfirmedAt!.toISOString(),
      })),
    };
  }

  async cancelAttempt(storeId: bigint, deviceId: string, saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale) {
      throw new NotFoundException('Không tìm thấy đơn hàng cần hủy.');
    }
    if (sale.storeId !== storeId || sale.deviceId !== deviceId) {
      throw new ForbiddenException('Đơn không thuộc máy POS/chi nhánh này.');
    }
    if (sale.status === 'PAID') {
      throw new ConflictException(
        'Đơn hàng đã được thanh toán, không thể hủy.',
      );
    }
    const payment = sale.payments.find((p) =>
      ONLINE_PAYMENT_METHODS.includes(p.method),
    );
    if (!payment) {
      throw new ConflictException(
        'Không tìm thấy giao dịch online cho đơn này.',
      );
    }
    if (payment.status === 'CANCELLED') {
      return this.getAttempt(storeId, deviceId, saleId, false);
    }
    if (payment.status === 'PAID' || payment.providerConfirmedAt) {
      throw new ConflictException(
        'Giao dịch đã được xác nhận thanh toán, không thể hủy.',
      );
    }
    if (payment.status === 'EXPIRED') {
      return this.getAttempt(storeId, deviceId, saleId, false);
    }

    if (payment.method === 'MOMO') {
      // Local tombstone, not a claim that MoMo invalidated the old QR.
      await this.prisma.$transaction(async (tx) => {
        await lockStoreCheckout(tx, storeId);
        await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
        const current = await tx.payment.findUnique({
          where: { id: payment.id },
        });
        if (current?.status === 'CANCELLED') return;
        if (
          !current ||
          current.status === 'PAID' ||
          current.providerConfirmedAt
        )
          throw new ConflictException('Giao dịch đã nhận tiền. Không thể hủy.');
        if (current.status !== 'PENDING') return;
        const now = new Date();
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            ...(!current.createRequestedAt ? { providerFinalizedAt: now } : {}),
          },
        });
        await tx.sale.updateMany({
          where: { id: saleId, status: 'PAYMENT_PENDING' },
          data: { status: 'CANCELLED' },
        });
        await tx.auditLog.create({
          data: {
            actorType: 'DEVICE',
            actorDeviceId: deviceId,
            storeId,
            action: 'PAYMENT_CANCELLED_LOCALLY',
            entityType: 'payment',
            entityId: payment.id,
            metadata: {
              saleId,
              merchantOrderId: current.merchantOrderId,
              amountVnd: current.amountVnd.toString(),
            },
          },
        });
      });
      return this.getAttempt(storeId, deviceId, saleId, false);
    }

    let providerFinalUnpaid = false;
    if (payment.merchantOrderId && payment.createRequestedAt) {
      try {
        const cancelled = await this.adapter(payment.method).cancelOrder(
          payment.merchantOrderId,
        );
        providerFinalUnpaid = cancelled === 'CANCELLED';
        if (!providerFinalUnpaid) {
          const query = await this.adapter(payment.method).queryOrder(
            payment.merchantOrderId,
          );
          if (
            query.state === 'PAID' &&
            query.amountVnd === payment.amountVnd &&
            query.providerTransactionId
          ) {
            await this.recordConfirmation(
              payment.id,
              query.providerTransactionId,
            );
            throw new ConflictException(
              'Khách hàng đã thanh toán thành công qua cổng thanh toán. Không thể hủy.',
            );
          }
          providerFinalUnpaid =
            query.state === 'EXPIRED' &&
            (payment.method === 'ZALOPAY' ||
              query.amountVnd === payment.amountVnd);
        }
      } catch (err) {
        if (err instanceof ConflictException) throw err;
        this.logger.warn('Online payment cancellation remains unresolved.');
      }
    }

    // Only provider cancellation or confirmed expiry releases a claimed QR.
    // WAITING, UNKNOWN, timeout, or an in-flight create remain locked.
    if (payment.createRequestedAt && !providerFinalUnpaid) {
      return {
        ...(await this.getAttempt(storeId, deviceId, saleId, false)),
        message:
          'QR chưa được xác nhận kết thúc. Giữ nguyên giỏ và tiếp tục đối soát.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await lockStoreCheckout(tx, storeId);
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;

      const current = await tx.payment.findUnique({
        where: { id: payment.id },
      });
      if (current?.status === 'PAID' || current?.providerConfirmedAt) {
        throw new ConflictException(
          'Giao dịch vừa được thanh toán. Không thể hủy.',
        );
      }
      if (!current || current.status !== 'PENDING') return;
      // Recheck after acquiring locks: createOrder could have claimed this
      // intent since the initial read. Never expire that provider request.
      if (
        current.createRequestedAt &&
        (!providerFinalUnpaid ||
          current.merchantOrderId !== payment.merchantOrderId)
      )
        return;

      const expired = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING', providerConfirmedAt: null },
        data: { status: 'EXPIRED' },
      });
      if (expired.count === 1) {
        await tx.sale.updateMany({
          where: { id: saleId, status: 'PAYMENT_PENDING' },
          data: { status: 'EXPIRED' },
        });
      }
    });

    return this.getAttempt(storeId, deviceId, saleId, false);
  }
}
