import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { CryptoUtil } from '../common/security/crypto.util';
import { CreateActivationDto } from './dto/create-activation.dto';
import {
  EnrollDeviceDto,
  EnrollDeviceResponseDto,
} from './dto/enroll-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async createActivationCode(
    dto: CreateActivationDto,
    creatorUserId: bigint,
  ): Promise<{ activationCode: string; expiresAt: Date; storeId: string }> {
    const storeId = BigInt(dto.storeId);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store || store.status !== 'ACTIVE') {
      throw new NotFoundException(
        'Chi nhánh không tồn tại hoặc không hoạt động.',
      );
    }

    const activeDevice = await this.prisma.device.findFirst({
      where: { storeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (activeDevice && !dto.reissue) {
      throw new ConflictException(
        'This store already has an active POS. Revoke it before issuing another activation code.',
      );
    }

    // Thu hồi bất kỳ mã kích hoạt nào chưa sử dụng trước đó của chi nhánh này
    await this.prisma.deviceActivationCode.updateMany({
      where: {
        storeId,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const { fullCode, codeLookup, secretHash } =
      CryptoUtil.generateActivationCode();
    const expiresInHours = dto.expiresInHours ?? 24;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);

    await this.prisma.deviceActivationCode.create({
      data: {
        id: randomUUID(),
        storeId,
        codeLookup,
        secretHash,
        createdByUserId: creatorUserId,
        expiresAt,
        isReplacement: dto.reissue === true,
      },
    });

    return {
      activationCode: fullCode,
      expiresAt,
      storeId: store.id.toString(),
    };
  }

  async enrollDevice(dto: EnrollDeviceDto): Promise<EnrollDeviceResponseDto> {
    const parts = dto.activationCode.trim().split('.');
    if (parts.length !== 2) {
      throw new UnprocessableEntityException(
        'Mã kích hoạt không đúng định dạng (<lookup>.<secret>).',
      );
    }
    const [codeLookup, secret] = parts;

    const activation = await this.prisma.deviceActivationCode.findUnique({
      where: { codeLookup },
      include: { store: true },
    });

    if (!activation) {
      throw new NotFoundException(
        'Mã kích hoạt không hợp lệ hoặc không tồn tại.',
      );
    }
    if (activation.usedAt || activation.usedByDeviceId) {
      throw new ConflictException('Mã kích hoạt này đã được sử dụng.');
    }
    if (activation.revokedAt) {
      throw new ConflictException('Mã kích hoạt này đã bị thu hồi.');
    }
    if (new Date() > activation.expiresAt) {
      throw new UnprocessableEntityException('Mã kích hoạt đã hết hạn.');
    }
    if (!CryptoUtil.verifySecret(secret, activation.secretHash)) {
      throw new UnauthorizedException(
        'Secret của mã kích hoạt không chính xác.',
      );
    }

    const deviceId = randomUUID();
    const rawCredential = randomBytes(32).toString('hex');
    const credentialHash = CryptoUtil.sha256(rawCredential);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Kiểm tra thiết bị ACTIVE hiện tại của chi nhánh
      const currentActive = await tx.device.findFirst({
        where: { storeId: activation.storeId, status: 'ACTIVE' },
      });
      if (currentActive) {
        // Chặn nếu mã này không mang ý định thay thế (được cấp như mã tạo mới ban đầu)
        if (!activation.isReplacement) {
          throw new ConflictException(
            'Mã kích hoạt này được cấp để đăng ký mới, không có quyền thay thế thiết bị POS đang hoạt động. Vui lòng yêu cầu cấp lại mã thay thế (re-issue).',
          );
        }

        await tx.device.update({
          where: { id: currentActive.id },
          data: {
            status: 'REVOKED',
            revokedAt: now,
          },
        });

        await tx.cashierSession.updateMany({
          where: { deviceId: currentActive.id, status: 'ACTIVE' },
          data: { status: 'REVOKED', endedAt: now },
        });

        await tx.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            storeId: activation.storeId,
            action: 'DEVICE_REVOKED',
            entityType: 'devices',
            entityId: currentActive.id,
            metadata: {
              reason: 'REPLACED_BY_NEW_ENROLLMENT',
              replacementDeviceId: deviceId,
            },
          },
        });
      }

      await tx.device.create({
        data: {
          id: deviceId,
          storeId: activation.storeId,
          displayName: dto.displayName,
          status: 'ACTIVE',
          credentialHash,
          appVersion: dto.appVersion,
          lastHeartbeatAt: now,
        },
      });

      await tx.deviceActivationCode.update({
        where: { id: activation.id },
        data: {
          usedAt: now,
          usedByDeviceId: deviceId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          storeId: activation.storeId,
          action: 'DEVICE_ENROLLED',
          entityType: 'devices',
          entityId: deviceId,
          metadata: {
            displayName: dto.displayName,
            appVersion: dto.appVersion,
          },
        },
      });
    });

    return {
      deviceId,
      storeId: activation.store.id.toString(),
      storeName: activation.store.name,
      deviceCredential: rawCredential,
    };
  }

  async revokeDevice(
    deviceId: string,
    ownerUserId: bigint,
  ): Promise<{ success: boolean; deviceId: string; status: string }> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) {
      throw new NotFoundException('Thiết bị không tồn tại.');
    }
    if (device.status === 'REVOKED') {
      throw new ConflictException('Thiết bị này đã bị thu hồi trước đó.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      });

      await tx.cashierSession.updateMany({
        where: { deviceId, status: 'ACTIVE' },
        data: { status: 'REVOKED', endedAt: now },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId: ownerUserId,
          storeId: device.storeId,
          action: 'DEVICE_REVOKED_MANUALLY',
          entityType: 'devices',
          entityId: deviceId,
          metadata: {
            reason: 'EMERGENCY_REVOKE_BY_OWNER',
          },
        },
      });
    });

    return { success: true, deviceId, status: 'REVOKED' };
  }

  async authenticateDevice(authHeader?: string) {
    if (!authHeader || !authHeader.startsWith('Device ')) {
      throw new UnauthorizedException(
        'Yêu cầu header Authorization: Device <credential>',
      );
    }
    const rawCredential = authHeader.substring(7).trim();
    const hash = CryptoUtil.sha256(rawCredential);

    const device = await this.prisma.device.findFirst({
      where: { credentialHash: hash, status: 'ACTIVE' },
      include: { store: true },
    });

    if (!device) {
      throw new UnauthorizedException(
        'Thiết bị không tồn tại, đã bị thu hồi hoặc sai credential.',
      );
    }

    return device;
  }

  async recordHeartbeat(
    deviceId: string,
    payload?: {
      appVersion?: string;
      hasPendingOutbox?: boolean;
      outboxPendingCount?: number;
    },
  ): Promise<{ ok: boolean }> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        lastHeartbeatAt: new Date(),
        ...(payload?.appVersion && { appVersion: payload.appVersion }),
        ...(payload?.hasPendingOutbox !== undefined && {
          hasPendingOutbox: payload.hasPendingOutbox,
        }),
        ...(payload?.outboxPendingCount !== undefined && {
          outboxPendingCount: payload.outboxPendingCount,
        }),
      },
    });
    return { ok: true };
  }
}
