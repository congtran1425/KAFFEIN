import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

/** Shared short transaction barrier for checkout and stock/register mutations. */
export async function lockStoreCheckout(
  tx: Prisma.TransactionClient,
  storeId: bigint,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('kaffein-checkout:' || ${storeId}::text, 0))`;
}

export async function assertNoPendingOnlinePayment(
  tx: Prisma.TransactionClient,
  storeId: bigint,
  exceptSaleId?: string,
) {
  const pending = await tx.payment.findFirst({
    where: {
      storeId,
      method: { in: ['ZALOPAY', 'MOMO'] },
      // Locally cancelled payments are monitored separately for late receipts.
      status: { not: 'CANCELLED' },
      ...(exceptSaleId ? { saleId: { not: exceptSaleId } } : {}),
      OR: [
        { status: 'PENDING' },
        { status: { not: 'PAID' }, providerConfirmedAt: { not: null } },
      ],
    },
  });
  if (pending)
    throw new ConflictException(
      'PAYMENT_PENDING: Cần đối soát thanh toán online trước khi bán/điều chỉnh kho/đóng quỹ.',
    );
}
