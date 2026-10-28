import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CryptoUtil } from './crypto.util';
import { ActiveWebPrincipalGuard } from './active-web-principal.guard';
import { PrismaService } from '../../database/prisma.service';

describe('ActiveWebPrincipalGuard', () => {
  const secret =
    process.env.JWT_ACCESS_SECRET ||
    'local-development-access-secret-change-before-deploy';
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const guard = new ActiveWebPrincipalGuard(prisma as unknown as PrismaService);
  const context = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as unknown as ExecutionContext;
  const token = (role = 'STORE_MANAGER', homeStoreId = '2') =>
    'Bearer ' +
    CryptoUtil.signJwt({ userId: '4', role, homeStoreId }, secret, 3600);

  beforeEach(() => jest.clearAllMocks());

  it('leaves device credentials to the device guard', async () => {
    await expect(guard.canActivate(context('Device opaque'))).resolves.toBe(
      true,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('accepts an active account with matching role and store', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      role: 'STORE_MANAGER',
      homeStoreId: 2n,
    });
    await expect(guard.canActivate(context(token()))).resolves.toBe(true);
  });

  it.each([
    [{ status: 'SUSPENDED', role: 'STORE_MANAGER', homeStoreId: 2n }],
    [{ status: 'ACTIVE', role: 'STORE_MANAGER', homeStoreId: 3n }],
    [{ status: 'ACTIVE', role: 'EMPLOYEE', homeStoreId: 2n }],
    [null],
  ])('rejects a stale account token (%p)', async (user) => {
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(guard.canActivate(context(token()))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
