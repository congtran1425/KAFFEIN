import type { PrismaClient } from '../src/generated/prisma/client';

// Codes come from the migrated DB trigger, never from users.id or MAX(code)+1.
// On a fresh DB: Owner 1000001, manager Q1 1000701, cashier 1000702, manager Q2 1000703.
// Existing codes/credentials/history are preserved when a local seed is repeated.
export async function ensureDemoEmployees(
  prisma: PrismaClient,
  store1Id: bigint,
  store2Id: bigint,
) {
  async function ensureUser(
    fullName: string,
    role: 'OWNER' | 'STORE_MANAGER' | 'EMPLOYEE',
    homeStoreId: bigint | null,
  ) {
    const existing = await prisma.user.findFirst({
      where: { role, homeStoreId },
    });
    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { fullName, homeStoreId },
      });
    }
    return prisma.user.create({ data: { fullName, role, homeStoreId } });
  }

  const owner = await ensureUser('Võ Minh Anh', 'OWNER', null);
  const manager1 = await ensureUser('Trần Chí Công', 'STORE_MANAGER', store1Id);
  const cashier1 = await ensureUser('Phạm Quang Minh', 'EMPLOYEE', store1Id);
  const manager2 = await ensureUser(
    'Lê Quang Khánh',
    'STORE_MANAGER',
    store2Id,
  );
  return { owner, manager1, cashier1, manager2 };
}
