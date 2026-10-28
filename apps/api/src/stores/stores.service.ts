import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async createStore(dto: CreateStoreDto, creatorUserId: bigint) {
    const existing = await this.prisma.store.findUnique({
      where: { code: dto.code.trim() },
    });
    if (existing) {
      throw new ConflictException(`Mã chi nhánh '${dto.code}' đã tồn tại.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          code: dto.code.trim(),
          name: dto.name.trim(),
          address: dto.address.trim(),
          status: 'ACTIVE',
        },
      });

      // Khởi tạo tồn kho ban đầu (balance = 0) cho tất cả nguyên liệu hiện có
      const ingredients = await tx.ingredient.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      if (ingredients.length > 0) {
        await tx.stockBalance.createMany({
          data: ingredients.map((ing) => ({
            storeId: store.id,
            ingredientId: ing.id,
            quantity: 0,
            version: BigInt(1),
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId: creatorUserId,
          storeId: store.id,
          action: 'STORE_CREATED',
          entityType: 'stores',
          entityId: store.id.toString(),
          metadata: {
            code: store.code,
            name: store.name,
            address: store.address,
          },
        },
      });

      return {
        id: store.id.toString(),
        code: store.code,
        name: store.name,
        address: store.address,
        status: store.status,
        createdAt: store.createdAt.toISOString(),
      };
    });
  }

  async getStoreDevices(storeIdStr: string) {
    const storeId = BigInt(storeIdStr);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        devices: {
          orderBy: { enrolledAt: 'desc' },
        },
      },
    });
    if (!store) {
      throw new NotFoundException('Chi nhánh không tồn tại.');
    }

    return {
      storeId: store.id.toString(),
      storeName: store.name,
      devices: store.devices.map((d) => ({
        id: d.id,
        displayName: d.displayName,
        status: d.status,
        appVersion: d.appVersion,
        enrolledAt: d.enrolledAt.toISOString(),
        lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null,
        revokedAt: d.revokedAt?.toISOString() ?? null,
      })),
    };
  }
}
