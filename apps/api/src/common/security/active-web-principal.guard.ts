import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WebPrincipalUtil } from './web-principal.util';

/** Bearer tokens must reflect the current account, not just a signed snapshot. */
@Injectable()
export class ActiveWebPrincipalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authorization = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
    }>().headers.authorization;
    // Device credentials and public endpoints retain their existing guards.
    if (!authorization?.startsWith('Bearer ')) return true;

    const principal = WebPrincipalUtil.parseToken(authorization);
    if (!/^[1-9]\d*$/.test(principal.userId)) {
      throw new UnauthorizedException('Invalid account identity.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(principal.userId) },
      select: { role: true, status: true, homeStoreId: true },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.role !== principal.role ||
      (user.homeStoreId?.toString() ?? null) !== (principal.homeStoreId ?? null)
    ) {
      throw new UnauthorizedException(
        'Account or store assignment has changed. Sign in again.',
      );
    }
    return true;
  }
}
