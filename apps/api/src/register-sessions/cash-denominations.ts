import { BadRequestException } from '@nestjs/common';

export const CASH_DENOMINATIONS = [
  500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000,
];
export function cashAmount(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new BadRequestException(
      'Số tiền phải là số nguyên VND không âm hợp lệ.',
    );
  return BigInt(value);
}
export function cashDenominations(
  value: unknown,
  amount: bigint,
  required = false,
): Record<string, number> | undefined {
  if (value == null) {
    if (required)
      throw new BadRequestException('Cần bảng kê mệnh giá tiền mặt.');
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Bảng kê mệnh giá không hợp lệ.');
  const normalized: Record<string, number> = {};
  let sum = 0n;
  for (const [key, count] of Object.entries(value)) {
    if (
      !CASH_DENOMINATIONS.some((d) => String(d) === key) ||
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 99999
    )
      throw new BadRequestException('Mệnh giá hoặc số tờ không hợp lệ.');
    if (count > 0) normalized[key] = count;
    sum += BigInt(key) * BigInt(count);
  }
  if (sum !== amount)
    throw new BadRequestException('Bảng kê không khớp tổng tiền.');
  return normalized;
}
export function mergeCashDenominations(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    CASH_DENOMINATIONS.map((d) => [
      String(d),
      (a[d] ?? 0) + (b[d] ?? 0),
    ]).filter(([, n]) => Number(n) > 0),
  );
}
