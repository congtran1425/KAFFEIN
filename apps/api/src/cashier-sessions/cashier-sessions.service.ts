import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { CryptoUtil } from '../common/security/crypto.util';
import { DevicesService } from '../devices/devices.service';
import {
  CashierLoginDto,
  CashierLoginResponseDto,
} from './dto/cashier-login.dto';

@Injectable()
export class CashierSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {}

  async login(
    authHeader: string | undefined,
    dto: CashierLoginDto,
  ): Promise<CashierLoginResponseDto> {
    // 1. Xác thực máy POS từ device token
    const device = await this.devicesService.authenticateDevice(authHeader);

    // 2. Tìm nhân viên theo mã 7 số
    const employeeCode = BigInt(dto.employeeCode);
    const user = await this.prisma.user.findUnique({
      where: { employeeCode },
      include: { pinCredential: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Thông tin nhân viên hoặc mã PIN không chính xác.',
      );
    }

    // 3. Kiểm tra mã PIN
    if (!user.pinCredential) {
      throw new UnauthorizedException(
        'Thông tin nhân viên hoặc mã PIN không chính xác.',
      );
    } else {
      if (
        user.pinCredential.lockedUntil &&
        user.pinCredential.lockedUntil > new Date()
      ) {
        throw new UnauthorizedException(
          'Mã PIN tạm thời bị khóa do nhập sai nhiều lần.',
        );
      }

      const isPinValid = await CryptoUtil.verifyPin(
        dto.pin,
        user.pinCredential.pinHash,
      );
      if (!isPinValid) {
        const attempt = await this.prisma.employeePinCredential.update({
          where: { userId: user.id },
          data: { failedAttempts: { increment: 1 } },
        });
        if (attempt.failedAttempts >= 5) {
          await this.prisma.employeePinCredential.update({
            where: { userId: user.id },
            data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
          });
        }
        throw new UnauthorizedException(
          'Thông tin nhân viên hoặc mã PIN không chính xác.',
        );
      }

      if (user.pinCredential.failedAttempts > 0) {
        await this.prisma.employeePinCredential.update({
          where: { userId: user.id },
          data: { failedAttempts: 0, lockedUntil: null },
        });
      }
    }

    // 4. QUY TẮC BẤT KHẢ XÂM PHẠM: Thu ngân chỉ được đăng nhập tại home_store_id của mình!
    if (user.homeStoreId !== device.storeId) {
      throw new ForbiddenException(
        'Nhân viên chỉ được phép đăng nhập thu ngân tại chi nhánh chính (Home Store). Không được phép bán hàng tại chi nhánh hỗ trợ.',
      );
    }

    const sessionId = randomUUID();
    const now = new Date();

    // 5. Đóng các phiên cũ của máy POS này (nếu có) và lưu phiên thu ngân mới vào Database
    await this.prisma.$transaction(async (tx) => {
      await tx.cashierSession.updateMany({
        where: { deviceId: device.id, status: 'ACTIVE' },
        data: { status: 'CLOSED', endedAt: now },
      });

      await tx.cashierSession.create({
        data: {
          id: sessionId,
          deviceId: device.id,
          storeId: device.storeId,
          userId: user.id,
          status: 'ACTIVE',
          startedAt: now,
          lastActivityAt: now,
        },
      });
    });

    return {
      sessionId,
      employeeId: user.id.toString(),
      employeeCode: dto.employeeCode,
      employeeName: user.fullName,
      storeId: device.storeId.toString(),
      storeName: device.store.name,
      loggedInAt: now.toISOString(),
    };
  }

  async getActiveSession(deviceId: string) {
    return this.prisma.cashierSession.findFirst({
      where: { deviceId, status: 'ACTIVE' },
      include: { user: true },
      orderBy: { startedAt: 'desc' },
    });
  }
}
