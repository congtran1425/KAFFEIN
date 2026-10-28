import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CryptoUtil } from '../common/security/crypto.util';
import {
  WebLoginDto,
  WebLoginResponseDto,
  StoreResponseDto,
  MeResponseDto,
} from './dto/auth.dto';

const JWT_EXPIRES_IN = 8 * 3600; // 8 hours

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private jwtSecret(): string {
    return (
      process.env.JWT_ACCESS_SECRET ||
      'local-development-access-secret-change-before-deploy'
    );
  }

  async webLogin(dto: WebLoginDto): Promise<WebLoginResponseDto> {
    const emailInput = dto.email.trim();
    const alternateEmail = emailInput.toLowerCase().endsWith('@kaffein.vn')
      ? emailInput.replace(/@kaffein\.vn$/i, '@coffeepos.vn')
      : emailInput.toLowerCase().endsWith('@coffeepos.vn')
        ? emailInput.replace(/@coffeepos\.vn$/i, '@kaffein.vn')
        : emailInput;

    const credential = await this.prisma.webCredential.findFirst({
      where: {
        OR: [
          { email: { equals: emailInput, mode: 'insensitive' } },
          { email: { equals: alternateEmail, mode: 'insensitive' } },
        ],
      },
      include: {
        user: true,
      },
    });

    if (!credential) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    if (credential.user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Tài khoản bị khóa. Vui lòng liên hệ quản trị viên.',
      );
    }

    // Check account lockout
    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Tài khoản tạm thời bị khóa do nhập sai quá nhiều lần. Vui lòng thử lại sau.',
      );
    }

    const isValid = await CryptoUtil.verifyPin(
      dto.password,
      credential.passwordHash,
    );

    if (!isValid) {
      // Increment failed attempts
      const newAttempts = credential.failedAttempts + 1;
      const lockedUntil =
        newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.webCredential.update({
        where: { userId: credential.userId },
        data: {
          failedAttempts: newAttempts,
          ...(lockedUntil ? { lockedUntil } : {}),
        },
      });
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    // Reset failed attempts on success
    await this.prisma.webCredential.update({
      where: { userId: credential.userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    const role = credential.user.role as 'OWNER' | 'STORE_MANAGER';
    const homeStoreId = credential.user.homeStoreId?.toString() ?? null;

    const accessToken = CryptoUtil.signJwt(
      {
        userId: credential.user.id.toString(),
        role,
        homeStoreId,
      },
      this.jwtSecret(),
      JWT_EXPIRES_IN,
    );

    return {
      accessToken,
      userId: credential.user.id.toString(),
      role,
      homeStoreId,
      fullName: credential.user.fullName,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  async getStores(
    requestRole: string,
    homeStoreId?: string,
  ): Promise<StoreResponseDto[]> {
    const now = Date.now();
    const HEARTBEAT_THRESHOLD_MS = 90_000;

    const stores = await this.prisma.store.findMany({
      where: requestRole === 'OWNER' ? {} : { id: BigInt(homeStoreId!) },
      orderBy: { code: 'asc' },
      include: {
        devices: {
          select: {
            id: true,
            displayName: true,
            status: true,
            appVersion: true,
            lastHeartbeatAt: true,
            hasPendingOutbox: true,
            enrolledAt: true,
          },
          orderBy: { enrolledAt: 'desc' },
        },
      },
    });

    return stores.map((store) => {
      const activeDeviceEntity =
        store.devices.find((d) => d.status === 'ACTIVE') ?? null;
      const revokedDeviceCount = store.devices.filter(
        (d) => d.status === 'REVOKED',
      ).length;

      const lastHeartbeatMs =
        activeDeviceEntity?.lastHeartbeatAt?.getTime() ?? 0;
      const posOnline =
        activeDeviceEntity !== null &&
        now - lastHeartbeatMs <= HEARTBEAT_THRESHOLD_MS;

      const activeDevice = activeDeviceEntity
        ? {
            id: activeDeviceEntity.id,
            displayName: activeDeviceEntity.displayName,
            appVersion: activeDeviceEntity.appVersion,
            lastHeartbeatAt:
              activeDeviceEntity.lastHeartbeatAt?.toISOString() ?? null,
            isOnline: posOnline,
            hasPendingOutbox: activeDeviceEntity.hasPendingOutbox,
          }
        : null;

      return {
        id: store.id.toString(),
        code: store.code,
        name: store.name,
        address: store.address,
        posDeviceId: activeDeviceEntity?.id ?? null,
        posLastHeartbeat:
          activeDeviceEntity?.lastHeartbeatAt?.toISOString() ?? null,
        posOnline,
        posHasPendingOutbox: activeDeviceEntity?.hasPendingOutbox ?? false,
        activeDevice,
        revokedDeviceCount,
      };
    });
  }

  async getMe(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    return {
      userId: user.id.toString(),
      fullName: user.fullName,
      role: user.role as 'OWNER' | 'STORE_MANAGER',
      homeStoreId: user.homeStoreId?.toString() ?? null,
    };
  }
}
