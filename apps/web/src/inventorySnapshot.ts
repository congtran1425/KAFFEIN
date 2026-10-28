export function rowsForStore<T>(
  snapshot: { storeId: string; rows: T[] } | null,
  storeId: string | undefined,
): T[] {
  return snapshot && storeId && snapshot.storeId === storeId ? snapshot.rows : []
}
