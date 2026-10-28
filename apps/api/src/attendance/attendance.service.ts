import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { CryptoUtil } from '../common/security/crypto.util';
import { DevicesService } from '../devices/devices.service';
import { WebManagerPrincipal } from '../common/security/web-principal.util';
import {
  AttendanceCommandDto,
  AttendanceResponseDto,
} from './dto/attendance-command.dto';
import {
  AdjustAttendanceDto,
  AttendanceRecordItemDto,
  AttendanceSummaryResponseDto,
  ManualAttendanceDto,
  PaginatedAttendanceResponseDto,
  QueryAttendanceDto,
} from './dto/attendance-admin.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {}

  private async verifyEmployeeAndPin(employeeCodeStr: string, pin: string) {
    const employeeCode = BigInt(employeeCodeStr);
    const user = await this.prisma.user.findUnique({
      where: { employeeCode },
      include: { pinCredential: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Thông tin nhân viên hoặc mã PIN không chính xác.',
      );
    }

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
          'Mã PIN tạm thời bị khóa do nhập sai quá số lần.',
        );
      }

      const isValid = await CryptoUtil.verifyPin(
        pin,
        user.pinCredential.pinHash,
      );
      if (!isValid) {
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

      // Reset failed attempts khi đúng
      if (user.pinCredential.failedAttempts > 0) {
        await this.prisma.employeePinCredential.update({
          where: { userId: user.id },
          data: { failedAttempts: 0, lockedUntil: null },
        });
      }
    }

    return user;
  }

  async checkIn(
    authHeader: string | undefined,
    dto: AttendanceCommandDto,
  ): Promise<AttendanceResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    const employee = await this.verifyEmployeeAndPin(dto.employeeCode, dto.pin);

    // Kiểm tra ca đang mở
    const openAttendance = await this.prisma.attendanceRecord.findFirst({
      where: {
        userId: employee.id,
        checkOutAt: null,
        isMissedCheckout: false,
      },
    });

    let wasPreviousMissed = false;
    const now = new Date();

    if (openAttendance) {
      // Nếu ca mở đã quá 14 tiếng, tự động đóng ca cũ với cờ isMissedCheckout
      const durationHours =
        (now.getTime() - openAttendance.checkInAt.getTime()) / (1000 * 3600);
      if (durationHours > 14) {
        await this.prisma.attendanceRecord.update({
          where: { id: openAttendance.id },
          data: {
            checkOutAt: new Date(
              openAttendance.checkInAt.getTime() + 8 * 3600 * 1000,
            ), // gán tạm 8 tiếng
            isMissedCheckout: true,
          },
        });
        wasPreviousMissed = true;
      } else {
        throw new ConflictException(
          'Nhân viên đã có ca làm việc đang mở. Vui lòng check-out trước.',
        );
      }
    }

    const isSupport = employee.homeStoreId !== device.storeId;
    const attendanceId = randomUUID();

    const record = await this.prisma.attendanceRecord.create({
      data: {
        id: attendanceId,
        userId: employee.id,
        storeId: device.storeId,
        homeStoreIdAtCheckIn: employee.homeStoreId ?? device.storeId,
        isSupport,
        checkInDeviceId: device.id,
        checkInAt: now,
        isMissedCheckout: false,
      },
    });

    return {
      attendanceId: record.id,
      action: 'CHECK_IN',
      employeeName: employee.fullName,
      employeeCode: dto.employeeCode,
      storeId: device.storeId.toString(),
      storeName: device.store.name,
      isSupport,
      timestamp: record.checkInAt.toISOString(),
      wasPreviousMissed,
    };
  }

  async checkOut(
    authHeader: string | undefined,
    dto: AttendanceCommandDto,
  ): Promise<AttendanceResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    const employee = await this.verifyEmployeeAndPin(dto.employeeCode, dto.pin);

    const openAttendance = await this.prisma.attendanceRecord.findFirst({
      where: {
        userId: employee.id,
        checkOutAt: null,
        isMissedCheckout: false,
      },
    });

    if (!openAttendance) {
      throw new NotFoundException(
        'Không tìm thấy ca làm việc đang mở của nhân viên này để check-out.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.attendanceRecord.update({
      where: { id: openAttendance.id },
      data: {
        checkOutAt: now,
        checkOutDeviceId: device.id,
      },
    });

    return {
      attendanceId: updated.id,
      action: 'CHECK_OUT',
      employeeName: employee.fullName,
      employeeCode: dto.employeeCode,
      storeId: device.storeId.toString(),
      storeName: device.store.name,
      isSupport: updated.isSupport,
      timestamp: now.toISOString(),
      wasPreviousMissed: false,
    };
  }

  async getAttendanceRecords(
    principal: WebManagerPrincipal,
    query: QueryAttendanceDto,
  ): Promise<PaginatedAttendanceResponseDto> {
    const where: any = {};

    if (principal.role === 'STORE_MANAGER') {
      if (!principal.homeStoreId) {
        throw new ForbiddenException(
          'Quản lý chi nhánh chưa được gắn với chi nhánh nhà.',
        );
      }
      if (query.storeId && query.storeId !== principal.homeStoreId) {
        throw new ForbiddenException(
          'Quản lý chi nhánh chỉ được xem chấm công liên quan đến chi nhánh của mình.',
        );
      }
      const homeId = BigInt(principal.homeStoreId);
      where.OR = [{ storeId: homeId }, { homeStoreIdAtCheckIn: homeId }];
    } else if (query.storeId) {
      where.storeId = BigInt(query.storeId);
    }

    if (query.isSupport !== undefined) {
      where.isSupport = query.isSupport;
    }
    if (query.isMissedCheckout !== undefined) {
      where.isMissedCheckout = query.isMissedCheckout;
    }

    if (query.date) {
      // YYYY-MM-DD quy đổi theo múi giờ Asia/Ho_Chi_Minh (UTC+7)
      const dayStart = new Date(`${query.date}T00:00:00+07:00`);
      const dayEnd = new Date(`${query.date}T23:59:59.999+07:00`);
      where.checkInAt = { gte: dayStart, lte: dayEnd };
    } else if (query.fromDate || query.toDate) {
      where.checkInAt = {};
      if (query.fromDate) where.checkInAt.gte = new Date(query.fromDate);
      if (query.toDate) where.checkInAt.lte = new Date(query.toDate);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      const isDigits = /^\d+$/.test(term);
      if (isDigits) {
        try {
          const numCode = BigInt(term);
          where.user = {
            OR: [
              { fullName: { contains: term, mode: 'insensitive' } },
              { employeeCode: numCode },
            ],
          };
        } catch {
          where.user = { fullName: { contains: term, mode: 'insensitive' } };
        }
      } else {
        where.user = { fullName: { contains: term, mode: 'insensitive' } };
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
    const skip = (page - 1) * pageSize;

    const [total, records] = await Promise.all([
      this.prisma.attendanceRecord.count({ where }),
      this.prisma.attendanceRecord.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              role: true,
            },
          },
          store: { select: { id: true, name: true } },
          homeStore: { select: { id: true, name: true } },
        },
        orderBy: { checkInAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const items: AttendanceRecordItemDto[] = records.map((r) => {
      let note = 'Đủ lượt';
      if (r.isMissedCheckout) {
        note = 'Quên check-out';
      } else if (!r.checkOutAt) {
        note = 'Đang làm';
      } else if (r.isSupport) {
        note = 'Làm hỗ trợ';
      } else if (r.isManualEntry) {
        note = 'Nhập tay';
      }

      const empCode = r.user.employeeCode.toString();

      return {
        id: r.id,
        userId: r.userId.toString(),
        employeeCode: empCode,
        fullName: r.user.fullName,
        role: r.user.role,
        homeStoreId: r.homeStoreIdAtCheckIn.toString(),
        homeStoreName: r.homeStore.name,
        storeId: r.storeId.toString(),
        storeName: r.store.name,
        checkInAt: r.checkInAt.toISOString(),
        checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : null,
        isSupport: r.isSupport,
        isMissedCheckout: r.isMissedCheckout,
        isManualEntry: r.isManualEntry,
        note,
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

  async getAttendanceSummary(
    principal: WebManagerPrincipal,
    storeIdParam?: string,
  ): Promise<AttendanceSummaryResponseDto> {
    let filterStoreId: bigint | undefined;

    if (principal.role === 'STORE_MANAGER') {
      filterStoreId = BigInt(principal.homeStoreId!);
    } else if (storeIdParam) {
      filterStoreId = BigInt(storeIdParam);
    }

    const employeeWhere: any = { status: 'ACTIVE' };
    if (filterStoreId !== undefined) {
      employeeWhere.homeStoreId = filterStoreId;
    }

    const attendanceWhere: any = {};
    if (filterStoreId !== undefined) {
      attendanceWhere.storeId = filterStoreId;
    }

    const [totalEmployees, activeCount, abnormalCount] = await Promise.all([
      this.prisma.user.count({ where: employeeWhere }),
      this.prisma.attendanceRecord.count({
        where: {
          ...attendanceWhere,
          checkOutAt: null,
          isMissedCheckout: false,
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          ...attendanceWhere,
          isMissedCheckout: true,
        },
      }),
    ]);

    return {
      totalEmployees,
      activeCount,
      abnormalCount,
    };
  }

  async adjustAttendance(
    principal: WebManagerPrincipal,
    attendanceId: string,
    dto: AdjustAttendanceDto,
  ): Promise<AttendanceRecordItemDto> {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { id: attendanceId },
      include: {
        user: true,
        store: true,
        homeStore: true,
      },
    });

    if (!record) {
      throw new NotFoundException(
        `Không tìm thấy ca chấm công ID ${attendanceId}`,
      );
    }

    if (principal.role === 'STORE_MANAGER') {
      const homeId = BigInt(principal.homeStoreId!);
      if (record.storeId !== homeId && record.homeStoreIdAtCheckIn !== homeId) {
        throw new ForbiddenException(
          'Quản lý chi nhánh chỉ được điều chỉnh ca chấm công thuộc chi nhánh của mình.',
        );
      }
    }

    const newCheckIn = dto.checkInAt
      ? new Date(dto.checkInAt)
      : record.checkInAt;
    const newCheckOut = dto.checkOutAt
      ? new Date(dto.checkOutAt)
      : record.checkOutAt;

    if (newCheckOut && newCheckIn > newCheckOut) {
      throw new BadRequestException(
        'Thời gian check-in không thể sau thời gian check-out.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.attendanceRecord.update({
        where: { id: attendanceId },
        data: {
          checkInAt: newCheckIn,
          checkOutAt: newCheckOut,
          isMissedCheckout: newCheckOut ? false : record.isMissedCheckout,
        },
        include: {
          user: true,
          store: true,
          homeStore: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId: BigInt(principal.userId),
          storeId: record.storeId,
          action: 'ATTENDANCE_ADJUSTED',
          entityType: 'ATTENDANCE_RECORD',
          entityId: attendanceId,
          metadata: {
            reason: dto.reason,
            oldCheckInAt: record.checkInAt.toISOString(),
            newCheckInAt: newCheckIn.toISOString(),
            oldCheckOutAt: record.checkOutAt
              ? record.checkOutAt.toISOString()
              : null,
            newCheckOutAt: newCheckOut ? newCheckOut.toISOString() : null,
          },
        },
      });

      return rec;
    });

    let note = 'Đủ lượt';
    if (updated.isMissedCheckout) {
      note = 'Quên check-out';
    } else if (!updated.checkOutAt) {
      note = 'Đang làm';
    } else if (updated.isSupport) {
      note = 'Làm hỗ trợ';
    } else if (updated.isManualEntry) {
      note = 'Nhập tay';
    }

    const empCode = updated.user.employeeCode.toString();

    return {
      id: updated.id,
      userId: updated.userId.toString(),
      employeeCode: empCode,
      fullName: updated.user.fullName,
      role: updated.user.role,
      homeStoreId: updated.homeStoreIdAtCheckIn.toString(),
      homeStoreName: updated.homeStore.name,
      storeId: updated.storeId.toString(),
      storeName: updated.store.name,
      checkInAt: updated.checkInAt.toISOString(),
      checkOutAt: updated.checkOutAt ? updated.checkOutAt.toISOString() : null,
      isSupport: updated.isSupport,
      isMissedCheckout: updated.isMissedCheckout,
      isManualEntry: updated.isManualEntry,
      note,
    };
  }

  async createManualAttendance(
    principal: WebManagerPrincipal,
    dto: ManualAttendanceDto,
  ): Promise<AttendanceRecordItemDto> {
    const targetStoreId = BigInt(dto.storeId);

    if (principal.role === 'STORE_MANAGER') {
      if (principal.homeStoreId !== dto.storeId) {
        throw new ForbiddenException(
          'Quản lý chi nhánh chỉ được tạo ca bổ sung cho chi nhánh của mình.',
        );
      }
    }

    const userId = BigInt(dto.userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { homeStore: true },
    });

    if (!user) {
      throw new NotFoundException(`Không tìm thấy nhân viên ID ${dto.userId}`);
    }

    const store = await this.prisma.store.findUnique({
      where: { id: targetStoreId },
      include: { devices: { where: { status: 'ACTIVE' }, take: 1 } },
    });

    if (!store) {
      throw new NotFoundException(`Không tìm thấy chi nhánh ID ${dto.storeId}`);
    }

    const device = store.devices[0];
    if (!device) {
      throw new BadRequestException(
        'Chi nhánh chưa có thiết bị POS nào được kích hoạt.',
      );
    }

    const checkIn = new Date(dto.checkInAt);
    const checkOut = new Date(dto.checkOutAt);

    if (checkIn > checkOut) {
      throw new BadRequestException(
        'Thời gian check-in không thể sau thời gian check-out.',
      );
    }

    const isSupport = user.homeStoreId !== targetStoreId;
    const attendanceId = randomUUID();

    const created = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.attendanceRecord.create({
        data: {
          id: attendanceId,
          userId,
          storeId: targetStoreId,
          homeStoreIdAtCheckIn: user.homeStoreId ?? targetStoreId,
          isSupport,
          checkInDeviceId: device.id,
          checkOutDeviceId: device.id,
          checkInAt: checkIn,
          checkOutAt: checkOut,
          isMissedCheckout: false,
          isManualEntry: true,
        },
        include: {
          user: true,
          store: true,
          homeStore: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorUserId: BigInt(principal.userId),
          storeId: targetStoreId,
          action: 'ATTENDANCE_MANUAL_ENTRY',
          entityType: 'ATTENDANCE_RECORD',
          entityId: attendanceId,
          metadata: {
            reason: dto.reason,
            userId: dto.userId,
            checkInAt: dto.checkInAt,
            checkOutAt: dto.checkOutAt,
          },
        },
      });

      return rec;
    });

    const empCode = created.user.employeeCode.toString();

    return {
      id: created.id,
      userId: created.userId.toString(),
      employeeCode: empCode,
      fullName: created.user.fullName,
      role: created.user.role,
      homeStoreId: created.homeStoreIdAtCheckIn.toString(),
      homeStoreName: created.homeStore.name,
      storeId: created.storeId.toString(),
      storeName: created.store.name,
      checkInAt: created.checkInAt.toISOString(),
      checkOutAt: created.checkOutAt ? created.checkOutAt.toISOString() : null,
      isSupport: created.isSupport,
      isMissedCheckout: false,
      isManualEntry: true,
      note: 'Nhập tay',
    };
  }
}
