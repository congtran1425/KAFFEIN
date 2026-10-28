import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CryptoUtil } from '../common/security/crypto.util';
import { WebManagerPrincipal } from '../common/security/web-principal.util';
import {
  CreateEmployeeDto,
  ResetEmployeePinDto,
  UpdateEmployeeDto,
} from './dto/manage-employee.dto';
import {
  EmployeeItemDto,
  PaginatedEmployeesResponseDto,
  QueryEmployeesDto,
  TransferEmployeeDto,
  TransferHistoryItemDto,
} from './dto/employees.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertActiveOwner(
    principal: WebManagerPrincipal,
  ): Promise<bigint> {
    if (principal.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only the owner can manage employee credentials.',
      );
    }
    const actorUserId = BigInt(principal.userId);
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
    });
    if (!actor || actor.role !== 'OWNER' || actor.status !== 'ACTIVE') {
      throw new ForbiddenException('The owner account is not active.');
    }
    return actorUserId;
  }

  async createEmployee(
    principal: WebManagerPrincipal,
    dto: CreateEmployeeDto,
  ): Promise<EmployeeItemDto> {
    const actorUserId = await this.assertActiveOwner(principal);
    const homeStoreId = BigInt(dto.homeStoreId);
    const fullName = dto.fullName.trim();
    if (fullName.length < 2) {
      throw new BadRequestException('Employee name is too short.');
    }
    const store = await this.prisma.store.findUnique({
      where: { id: homeStoreId },
    });
    if (!store || store.status !== 'ACTIVE') {
      throw new NotFoundException('Home store does not exist or is inactive.');
    }

    const email = dto.email?.trim().toLowerCase();
    if (dto.role === 'STORE_MANAGER' && (!email || !dto.webPassword)) {
      throw new BadRequestException(
        'Store managers require an email and web password.',
      );
    }
    if (dto.role === 'EMPLOYEE' && (email || dto.webPassword)) {
      throw new BadRequestException(
        'Cashier employees do not have web credentials.',
      );
    }
    if (email) {
      const existing = await this.prisma.webCredential.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (existing) throw new ConflictException('Email is already in use.');
    }

    const pinHash = await CryptoUtil.hashPin(dto.pin);
    const passwordHash = dto.webPassword
      ? await CryptoUtil.hashPin(dto.webPassword)
      : null;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            fullName,
            role: dto.role,
            homeStoreId,
            status: 'ACTIVE',
            pinCredential: { create: { pinHash } },
            ...(email && passwordHash
              ? { webCredential: { create: { email, passwordHash } } }
              : {}),
          },
          include: { homeStore: true },
        });
        await tx.auditLog.create({
          data: {
            actorType: 'USER',
            actorUserId,
            storeId: homeStoreId,
            action: 'EMPLOYEE_CREATED',
            entityType: 'USER',
            entityId: created.id.toString(),
            metadata: {
              role: dto.role,
              employeeCode: created.employeeCode.toString(),
            },
          },
        });
        return created;
      });
      if (!user.employeeCode) {
        throw new Error('Database did not assign an employee code.');
      }
      return {
        id: user.id.toString(),
        employeeCode: user.employeeCode.toString(),
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        homeStoreId: user.homeStoreId?.toString() ?? null,
        homeStoreName: user.homeStore?.name ?? null,
        homeStoreCode: user.homeStore?.code ?? null,
        createdAt: user.createdAt.toISOString(),
      };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Employee or email already exists.');
      }
      throw error;
    }
  }

  async resetPin(
    principal: WebManagerPrincipal,
    employeeIdStr: string,
    dto: ResetEmployeePinDto,
  ): Promise<{ employeeId: string; pinVersion: number }> {
    const actorUserId = await this.assertActiveOwner(principal);
    if (!/^[1-9]\d*$/.test(employeeIdStr)) {
      throw new BadRequestException('Invalid employee ID.');
    }
    const employeeId = BigInt(employeeIdStr);
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
    });
    if (!employee || employee.role === 'OWNER') {
      throw new NotFoundException('Employee not found.');
    }
    if (employee.status !== 'ACTIVE') {
      throw new BadRequestException(
        'PIN can only be reset for active employees.',
      );
    }

    const pinHash = await CryptoUtil.hashPin(dto.pin);
    const now = new Date();
    const credential = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employeePinCredential.upsert({
        where: { userId: employeeId },
        create: { userId: employeeId, pinHash },
        update: {
          pinHash,
          pinVersion: { increment: 1 },
          failedAttempts: 0,
          lockedUntil: null,
          changedAt: now,
        },
      });
      await tx.cashierSession.updateMany({
        where: { userId: employeeId, status: 'ACTIVE' },
        data: { status: 'REVOKED', endedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId,
          storeId: employee.homeStoreId,
          action: 'EMPLOYEE_PIN_RESET',
          entityType: 'USER',
          entityId: employeeIdStr,
          metadata: { pinVersion: updated.pinVersion },
        },
      });
      return updated;
    });
    return { employeeId: employeeIdStr, pinVersion: credential.pinVersion };
  }

  async updateEmployee(
    principal: WebManagerPrincipal,
    employeeIdStr: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeItemDto> {
    const actorUserId = await this.assertActiveOwner(principal);
    if (!/^[1-9]\d*$/.test(employeeIdStr)) {
      throw new BadRequestException('Invalid employee ID.');
    }
    if (dto.fullName === undefined && dto.status === undefined) {
      throw new BadRequestException('Provide a name or status to update.');
    }
    const fullName = dto.fullName?.trim();
    if (fullName !== undefined && fullName.length < 2) {
      throw new BadRequestException('Employee name is too short.');
    }
    const employeeId = BigInt(employeeIdStr);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: employeeId } });
      if (!existing || existing.role === 'OWNER') {
        throw new NotFoundException('Employee not found.');
      }
      if (
        existing.status === 'TERMINATED' &&
        dto.status !== undefined &&
        dto.status !== 'TERMINATED'
      ) {
        throw new BadRequestException(
          'A terminated employee cannot be reactivated.',
        );
      }
      const updated = await tx.user.update({
        where: { id: employeeId },
        data: {
          ...(fullName !== undefined ? { fullName } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: { homeStore: true },
      });
      if (
        dto.status &&
        dto.status !== 'ACTIVE' &&
        existing.status !== dto.status
      ) {
        await tx.cashierSession.updateMany({
          where: { userId: employeeId, status: 'ACTIVE' },
          data: { status: 'REVOKED', endedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId,
          storeId: existing.homeStoreId,
          action: 'EMPLOYEE_UPDATED',
          entityType: 'USER',
          entityId: employeeIdStr,
          metadata: {
            previousStatus: existing.status,
            newStatus: updated.status,
            nameChanged:
              fullName !== undefined && fullName !== existing.fullName,
          },
        },
      });
      return {
        id: updated.id.toString(),
        employeeCode: updated.employeeCode.toString(),
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status,
        homeStoreId: updated.homeStoreId?.toString() ?? null,
        homeStoreName: updated.homeStore?.name ?? null,
        homeStoreCode: updated.homeStore?.code ?? null,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }

  async listEmployees(
    principal: WebManagerPrincipal,
    query: QueryEmployeesDto,
  ): Promise<PaginatedEmployeesResponseDto> {
    let filterStoreId: bigint | undefined;

    if (principal.role === 'STORE_MANAGER') {
      if (!principal.homeStoreId) {
        throw new ForbiddenException(
          'Quản lý chi nhánh chưa được gắn với chi nhánh nhà',
        );
      }
      if (query.storeId && query.storeId !== principal.homeStoreId) {
        throw new ForbiddenException(
          'Quản lý chi nhánh chỉ được phép xem danh sách nhân viên của chi nhánh mình.',
        );
      }
      filterStoreId = BigInt(principal.homeStoreId);
    } else if (query.storeId) {
      filterStoreId = BigInt(query.storeId);
    }

    const where: any = {};
    if (filterStoreId !== undefined) {
      where.homeStoreId = filterStoreId;
    }
    if (query.role) {
      where.role = query.role;
    }
    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      const isDigits = /^\d+$/.test(term);
      if (isDigits) {
        try {
          const numCode = BigInt(term);
          where.OR = [
            { fullName: { contains: term, mode: 'insensitive' } },
            { employeeCode: numCode },
          ];
        } catch {
          where.fullName = { contains: term, mode: 'insensitive' };
        }
      } else {
        where.fullName = { contains: term, mode: 'insensitive' };
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
    const skip = (page - 1) * pageSize;

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          homeStore: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: { id: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    const items: EmployeeItemDto[] = users.map((u) => {
      return {
        id: u.id.toString(),
        employeeCode: u.employeeCode.toString(),
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        homeStoreId: u.homeStoreId ? u.homeStoreId.toString() : null,
        homeStoreName: u.homeStore?.name || null,
        homeStoreCode: u.homeStore?.code || null,
        createdAt: u.createdAt.toISOString(),
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async transferEmployee(
    principal: WebManagerPrincipal,
    employeeIdStr: string,
    dto: TransferEmployeeDto,
  ): Promise<EmployeeItemDto> {
    if (principal.role !== 'OWNER') {
      throw new ForbiddenException(
        'Chỉ có Chủ chuỗi (OWNER) mới có quyền điều chuyển nhân viên giữa các chi nhánh.',
      );
    }

    const employeeId = BigInt(employeeIdStr);
    const toStoreId = BigInt(dto.toStoreId);

    const user = await this.prisma.user.findUnique({
      where: { id: employeeId },
      include: { homeStore: true },
    });

    if (!user) {
      throw new NotFoundException(
        `Không tìm thấy nhân viên ID ${employeeIdStr}`,
      );
    }

    if (user.role === 'OWNER') {
      throw new BadRequestException(
        'Không thể điều chuyển tài khoản Chủ chuỗi.',
      );
    }

    const toStore = await this.prisma.store.findUnique({
      where: { id: toStoreId },
    });

    if (!toStore) {
      throw new NotFoundException(
        `Không tìm thấy chi nhánh đích ID ${dto.toStoreId}`,
      );
    }

    if (user.homeStoreId === toStoreId) {
      throw new BadRequestException(
        `Nhân viên ${user.fullName} đã thuộc chi nhánh "${toStore.name}", không cần điều chuyển.`,
      );
    }

    const fromStoreId = user.homeStoreId;
    if (!fromStoreId) {
      throw new BadRequestException(
        'Nhân viên này chưa được gắn chi nhánh gốc ban đầu.',
      );
    }

    const actorUserId = BigInt(principal.userId);

    // Atomic transaction: Ghi lịch sử chuyển, cập nhật homeStoreId, thu hồi cashier session đang mở, lưu audit log
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      // 1. Ghi nhận lịch sử điều chuyển
      await tx.employeeStoreTransfer.create({
        data: {
          userId: employeeId,
          fromStoreId,
          toStoreId,
          transferredByUserId: actorUserId,
          effectiveAt: new Date(),
          reason: dto.reason?.trim() || null,
        },
      });

      // 2. Cập nhật chi nhánh nhà
      const updated = await tx.user.update({
        where: { id: employeeId },
        data: { homeStoreId: toStoreId },
        include: { homeStore: true },
      });

      // 3. Thu hồi toàn bộ cashier sessions đang active tại chi nhánh cũ
      await tx.cashierSession.updateMany({
        where: {
          userId: employeeId,
          status: 'ACTIVE',
        },
        data: {
          status: 'REVOKED',
          endedAt: new Date(),
        },
      });

      // 4. Lưu Audit Log
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId,
          storeId: toStoreId,
          action: 'EMPLOYEE_TRANSFERRED',
          entityType: 'USER',
          entityId: employeeIdStr,
          metadata: {
            fromStoreId: fromStoreId.toString(),
            toStoreId: toStoreId.toString(),
            reason: dto.reason || null,
          },
        },
      });

      return updated;
    });

    return {
      id: updatedUser.id.toString(),
      employeeCode: updatedUser.employeeCode.toString(),
      fullName: updatedUser.fullName,
      role: updatedUser.role,
      status: updatedUser.status,
      homeStoreId: updatedUser.homeStoreId
        ? updatedUser.homeStoreId.toString()
        : null,
      homeStoreName: updatedUser.homeStore?.name || null,
      homeStoreCode: updatedUser.homeStore?.code || null,
      createdAt: updatedUser.createdAt.toISOString(),
    };
  }

  async getTransferHistory(
    principal: WebManagerPrincipal,
    employeeIdStr: string,
  ): Promise<TransferHistoryItemDto[]> {
    const employeeId = BigInt(employeeIdStr);

    const user = await this.prisma.user.findUnique({
      where: { id: employeeId },
    });

    if (!user) {
      throw new NotFoundException(
        `Không tìm thấy nhân viên ID ${employeeIdStr}`,
      );
    }

    if (principal.role === 'STORE_MANAGER') {
      if (
        !user.homeStoreId ||
        user.homeStoreId.toString() !== principal.homeStoreId
      ) {
        throw new ForbiddenException(
          'Quản lý chi nhánh chỉ được xem lịch sử điều chuyển của nhân viên chi nhánh mình.',
        );
      }
    }

    const history = await this.prisma.employeeStoreTransfer.findMany({
      where: { userId: employeeId },
      include: {
        fromStore: { select: { id: true, name: true } },
        toStore: { select: { id: true, name: true } },
        transferredBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return history.map((h) => ({
      id: h.id.toString(),
      userId: h.userId.toString(),
      fromStoreId: h.fromStoreId.toString(),
      fromStoreName: h.fromStore.name,
      toStoreId: h.toStoreId.toString(),
      toStoreName: h.toStore.name,
      transferredByUserId: h.transferredByUserId.toString(),
      transferredByName: h.transferredBy.fullName,
      effectiveAt: h.effectiveAt.toISOString(),
      reason: h.reason,
      createdAt: h.createdAt.toISOString(),
    }));
  }
}
