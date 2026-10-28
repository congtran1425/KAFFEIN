import {
  lockStoreCheckout,
  assertNoPendingOnlinePayment,
} from '../common/payment-store-lock';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  cashAmount,
  cashDenominations,
  mergeCashDenominations,
} from './cash-denominations';
import {
  CloseRegisterSessionDto,
  OpenRegisterSessionDto,
  RegisterSessionResponseDto,
} from './dto/register-sessions.dto';

@Injectable()
export class RegisterSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private compensationFields(s: {
    compensationCashVnd?: bigint | null;
    compensationDenominations?: unknown;
    compensationNote?: string | null;
    closingMode?: string | null;
    handoverFromSessionId?: string | null;
  }) {
    return {
      compensationCashVnd: s.compensationCashVnd?.toString() ?? null,
      compensationDenominations:
        (s.compensationDenominations as Record<string, number>) ?? null,
      compensationNote: s.compensationNote ?? null,
      closingMode: s.closingMode ?? null,
      handoverFromSessionId: s.handoverFromSessionId ?? null,
    };
  }

  async getCurrentSession(
    deviceId: string,
  ): Promise<RegisterSessionResponseDto | null> {
    const session = await this.prisma.registerSession.findFirst({
      where: { deviceId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    if (!session) return null;

    return {
      ...this.compensationFields(session),
      id: session.id,
      deviceId: session.deviceId,
      storeId: session.storeId.toString(),
      openedByUserId: session.openedByUserId.toString(),
      closedByUserId: session.closedByUserId?.toString(),
      openingCashVnd: session.openingCashVnd.toString(),
      expectedCashVnd: session.expectedCashVnd?.toString(),
      actualCashVnd: session.actualCashVnd?.toString(),
      varianceVnd: session.varianceVnd?.toString(),
      status: session.status,
      openingDenominations:
        (session.openingDenominations as Record<string, number>) ?? null,
      closingDenominations:
        (session.closingDenominations as Record<string, number>) ?? null,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString(),
    };
  }

  async openSession(
    storeId: bigint,
    deviceId: string,
    dto: OpenRegisterSessionDto,
  ): Promise<RegisterSessionResponseDto> {
    return this.prisma.$transaction((tx) =>
      this.openSessionInsideTx(tx, storeId, deviceId, dto),
    );
  }

  async openSessionInsideTx(
    tx: Prisma.TransactionClient,
    storeId: bigint,
    deviceId: string,
    dto: OpenRegisterSessionDto,
  ): Promise<RegisterSessionResponseDto> {
    await lockStoreCheckout(tx, storeId);
    let openingCashVnd = cashAmount(dto.openingCashVnd);
    let openingDenominations = cashDenominations(
      dto.openingDenominations,
      openingCashVnd,
    );
    // 1. Kiểm tra xem có phiên nào đang mở trên máy POS này không
    const existing = await tx.registerSession.findFirst({
      where: { deviceId, status: 'OPEN' },
    });
    if (existing) {
      throw new ConflictException(
        'Đã có một phiên tiền mặt đang mở trên thiết bị POS này. Cần đóng ca trước khi mở ca mới.',
      );
    }

    // 2. Xác minh nhân viên mở ca (chấp nhận openedByUserId, openedByCode, hoặc phiên cashier session)
    let user = null;
    if (dto.openedByUserId) {
      user = await tx.user.findUnique({
        where: { id: BigInt(dto.openedByUserId) },
      });
    } else if (dto.openedByCode) {
      user = await tx.user.findUnique({
        where: { employeeCode: BigInt(dto.openedByCode) },
      });
    } else if (tx.cashierSession) {
      const activeSession = await tx.cashierSession.findFirst({
        where: { deviceId, status: 'ACTIVE' },
        include: { user: true },
        orderBy: { startedAt: 'desc' },
      });
      user = activeSession?.user ?? null;
    }

    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Nhân viên không tồn tại hoặc tài khoản đã bị khóa.',
      );
    }
    if (user.homeStoreId !== storeId) {
      throw new ForbiddenException(
        'Nhân viên chỉ được mở ca tiền mặt tại chi nhánh chính (Home Store).',
      );
    }

    const pendingHandover = await tx.registerSession.findFirst({
      where: {
        deviceId,
        storeId,
        status: 'CLOSED',
        closingMode: 'HANDOVER',
        handoverTo: null,
      },
      orderBy: { closedAt: 'desc' },
    });
    if (pendingHandover || dto.handoverFromSessionId) {
      if (!pendingHandover || pendingHandover.id !== dto.handoverFromSessionId)
        throw new ConflictException(
          'Cần nhận đúng phiên quỹ đang chờ bàn giao.',
        );
      const actual = pendingHandover.actualCashVnd!;
      const compensation = pendingHandover.compensationCashVnd ?? 0n;
      const carried = actual + compensation;
      const counts = mergeCashDenominations(
        cashDenominations(pendingHandover.closingDenominations, actual, true)!,
        cashDenominations(
          pendingHandover.compensationDenominations,
          compensation,
          compensation > 0n,
        ) ?? {},
      );
      if (
        openingCashVnd !== carried ||
        !openingDenominations ||
        JSON.stringify(openingDenominations) !==
          JSON.stringify(cashDenominations(counts, carried, true))
      )
        throw new BadRequestException(
          'Tiền và bảng kê nhận bàn giao không khớp phiên trước.',
        );
      openingCashVnd = carried;
      openingDenominations = counts;
    }

    const sessionId = dto.id ?? randomUUID();
    const openedAt = dto.openedAt ? new Date(dto.openedAt) : new Date();

    const session = await tx.registerSession.create({
      data: {
        id: sessionId,
        deviceId,
        storeId,
        openedByUserId: user.id,
        openingCashVnd,
        handoverFromSessionId: pendingHandover?.id,
        openingDenominations: openingDenominations
          ? (openingDenominations as Prisma.InputJsonValue)
          : undefined,
        openedAt,
        status: 'OPEN',
      },
    });

    return {
      ...this.compensationFields(session),
      id: session.id,
      deviceId: session.deviceId,
      storeId: session.storeId.toString(),
      openedByUserId: session.openedByUserId.toString(),
      openingCashVnd: session.openingCashVnd.toString(),
      status: session.status,
      openingDenominations:
        (session.openingDenominations as Record<string, number>) ?? null,
      closingDenominations: null,
      openedAt: session.openedAt.toISOString(),
    };
  }

  async closeSession(
    storeId: bigint,
    deviceId: string,
    sessionId: string,
    dto: CloseRegisterSessionDto,
  ): Promise<RegisterSessionResponseDto> {
    return this.prisma.$transaction((tx) =>
      this.closeSessionInsideTx(tx, storeId, deviceId, sessionId, dto),
    );
  }

  async closeSessionInsideTx(
    tx: Prisma.TransactionClient,
    storeId: bigint,
    deviceId: string,
    sessionId: string,
    dto: CloseRegisterSessionDto,
  ): Promise<RegisterSessionResponseDto> {
    await lockStoreCheckout(tx, storeId);
    await assertNoPendingOnlinePayment(tx, storeId);
    const session = await tx.registerSession.findUnique({
      where: { id: sessionId },
    });

    if (
      !session ||
      session.deviceId !== deviceId ||
      session.storeId !== storeId
    ) {
      throw new NotFoundException(
        `Phiên tiền mặt ${sessionId} không tồn tại trên thiết bị này.`,
      );
    }

    if (session.status !== 'OPEN') {
      throw new BadRequestException(
        'Phiên tiền mặt này đã được đóng trước đó.',
      );
    }

    let user = null;
    if (dto.closedByUserId) {
      user = await tx.user.findUnique({
        where: { id: BigInt(dto.closedByUserId) },
      });
    } else if (dto.closedByCode) {
      user = await tx.user.findUnique({
        where: { employeeCode: BigInt(dto.closedByCode) },
      });
    } else if (tx.cashierSession) {
      const activeCloseSession = await tx.cashierSession.findFirst({
        where: { deviceId, status: 'ACTIVE' },
        include: { user: true },
        orderBy: { startedAt: 'desc' },
      });
      user = activeCloseSession?.user ?? null;
    }

    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Nhân viên chốt ca không tồn tại hoặc tài khoản đã bị khóa.',
      );
    }
    if (user.homeStoreId !== storeId) {
      throw new ForbiddenException(
        'Nhân viên chỉ được đóng ca tiền mặt tại chi nhánh chính (Home Store).',
      );
    }

    // Tính toán tổng tiền mặt phát sinh trong ca
    const cashPayments = await tx.payment.findMany({
      where: {
        sale: { registerSessionId: sessionId, status: 'PAID' },
        method: 'CASH',
        status: 'PAID',
      },
    });

    const totalCashSalesVnd = cashPayments.reduce(
      (sum: bigint, p: { amountVnd: bigint }) => sum + p.amountVnd,
      0n,
    );

    const expectedCashVnd = session.openingCashVnd + totalCashSalesVnd;
    const actualCashVnd = cashAmount(dto.actualCashVnd);
    const varianceVnd = actualCashVnd - expectedCashVnd;
    const closingMode = dto.closingMode ?? 'END_OF_DAY';
    if (!['HANDOVER', 'END_OF_DAY'].includes(closingMode))
      throw new BadRequestException('Loại chốt phiên không hợp lệ.');
    const denominations = cashDenominations(
      dto.closingDenominations,
      actualCashVnd,
      closingMode === 'HANDOVER',
    );
    const compensationCashVnd = cashAmount(dto.compensationCashVnd ?? 0);
    const compensationDenominations = cashDenominations(
      dto.compensationDenominations,
      compensationCashVnd,
      varianceVnd < 0n,
    );
    if (varianceVnd < 0n && compensationCashVnd < -varianceVnd)
      throw new BadRequestException('Tiền nộp bù chưa đủ khoản thiếu quỹ.');
    if (varianceVnd >= 0n && compensationCashVnd !== 0n)
      throw new BadRequestException(
        'Phiên không thiếu quỹ không nhận tiền bù.',
      );
    if (
      dto.compensationNote != null &&
      (typeof dto.compensationNote !== 'string' ||
        dto.compensationNote.length > 500)
    )
      throw new BadRequestException('Ghi chú bù quỹ không hợp lệ.');
    if (closingMode === 'HANDOVER')
      cashDenominations(
        mergeCashDenominations(denominations!, compensationDenominations ?? {}),
        actualCashVnd + compensationCashVnd,
        true,
      );
    const closedAt = dto.closedAt ? new Date(dto.closedAt) : new Date();

    const updated = await tx.registerSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedByUserId: user.id,
        expectedCashVnd,
        actualCashVnd,
        varianceVnd,
        closingMode,
        compensationCashVnd: varianceVnd < 0n ? compensationCashVnd : null,
        compensationDenominations: compensationDenominations,
        compensationNote: dto.compensationNote?.trim() || null,
        closingDenominations: denominations
          ? (denominations as Prisma.InputJsonValue)
          : undefined,
        closedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: 'DEVICE',
        actorDeviceId: deviceId,
        storeId,
        action: 'REGISTER_SESSION_CLOSED',
        entityType: 'register_session',
        entityId: sessionId,
        metadata: {
          closedByUserId: user.id.toString(),
          closingMode,
          actualCashVnd: actualCashVnd.toString(),
          expectedCashVnd: expectedCashVnd.toString(),
          varianceVnd: varianceVnd.toString(),
          compensationCashVnd: compensationCashVnd.toString(),
        },
      },
    });

    return {
      ...this.compensationFields(updated),
      id: updated.id,
      deviceId: updated.deviceId,
      storeId: updated.storeId.toString(),
      openedByUserId: updated.openedByUserId.toString(),
      closedByUserId: updated.closedByUserId?.toString(),
      openingCashVnd: updated.openingCashVnd.toString(),
      expectedCashVnd: expectedCashVnd.toString(),
      actualCashVnd: actualCashVnd.toString(),
      varianceVnd: varianceVnd.toString(),
      status: updated.status,
      openingDenominations:
        (updated.openingDenominations as Record<string, number>) ?? null,
      closingDenominations:
        (updated.closingDenominations as Record<string, number>) ?? null,
      openedAt: updated.openedAt.toISOString(),
      closedAt: closedAt.toISOString(),
    };
  }

  async getSessions(options: {
    requestingRole: 'OWNER' | 'STORE_MANAGER';
    requestingHomeStoreId?: bigint;
    targetStoreId?: bigint;
    status?: string;
    variance?: 'BALANCED' | 'SURPLUS' | 'SHORTAGE';
    page?: number;
    pageSize?: number;
  }) {
    let filterStoreId: bigint | undefined;

    if (options.requestingRole === 'STORE_MANAGER') {
      if (!options.requestingHomeStoreId) {
        throw new ForbiddenException('Tài khoản không được gán chi nhánh nhà.');
      }
      if (
        options.targetStoreId &&
        options.targetStoreId !== options.requestingHomeStoreId
      ) {
        throw new ForbiddenException(
          'Không có quyền xem phiên tiền mặt của chi nhánh khác.',
        );
      }
      filterStoreId = options.requestingHomeStoreId;
    } else {
      if (options.targetStoreId) {
        filterStoreId = options.targetStoreId;
      }
    }

    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.RegisterSessionWhereInput = {
      ...(filterStoreId ? { storeId: filterStoreId } : {}),
      ...(options.status ? { status: options.status.toUpperCase() } : {}),
      ...(options.variance
        ? {
            varianceVnd:
              options.variance === 'BALANCED'
                ? 0n
                : options.variance === 'SURPLUS'
                  ? { gt: 0n }
                  : { lt: 0n },
          }
        : {}),
    };

    const [total, sessions] = await Promise.all([
      this.prisma.registerSession.count({ where }),
      this.prisma.registerSession.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { openedAt: 'desc' },
        include: {
          store: true,
          openedByUser: true,
          closedByUser: true,
        },
      }),
    ]);

    const items = sessions.map((s) => ({
      ...this.compensationFields(s),
      id: s.id,
      storeId: s.storeId.toString(),
      storeName: s.store.name,
      deviceId: s.deviceId,
      openedByUserId: s.openedByUserId.toString(),
      openedByName: s.openedByUser.fullName,
      closedByUserId: s.closedByUserId?.toString() ?? null,
      closedByName: s.closedByUser?.fullName ?? null,
      openingCashVnd: s.openingCashVnd.toString(),
      expectedCashVnd: s.expectedCashVnd?.toString() ?? null,
      actualCashVnd: s.actualCashVnd?.toString() ?? null,
      varianceVnd: s.varianceVnd?.toString() ?? null,
      openingDenominations:
        (s.openingDenominations as Record<string, number>) ?? null,
      closingDenominations:
        (s.closingDenominations as Record<string, number>) ?? null,
      status: s.status,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt ? s.closedAt.toISOString() : null,
    }));

    const scope = filterStoreId ? { storeId: filterStoreId } : {};
    const [open, surplus, shortage] = await Promise.all([
      this.prisma.registerSession.aggregate({
        where: { ...scope, status: 'OPEN' },
        _count: true,
        _sum: { openingCashVnd: true },
      }),
      this.prisma.registerSession.aggregate({
        where: { ...scope, status: 'CLOSED', varianceVnd: { gt: 0n } },
        _count: true,
        _sum: { varianceVnd: true },
      }),
      this.prisma.registerSession.aggregate({
        where: { ...scope, status: 'CLOSED', varianceVnd: { lt: 0n } },
        _count: true,
        _sum: { varianceVnd: true, compensationCashVnd: true },
      }),
    ]);
    return {
      summary: {
        openCount: open._count,
        openingCashVnd: (open._sum.openingCashVnd ?? 0n).toString(),
        surplusCount: surplus._count,
        surplusCashVnd: (surplus._sum.varianceVnd ?? 0n).toString(),
        shortageCount: shortage._count,
        shortageCashVnd: (-(shortage._sum.varianceVnd ?? 0n)).toString(),
        compensationCashVnd: (
          shortage._sum.compensationCashVnd ?? 0n
        ).toString(),
      },
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
