import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../database/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { UnauthorizedException } from '@nestjs/common';
import { CryptoUtil } from '../common/security/crypto.util';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: any;
  let devicesService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      employeePinCredential: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ failedAttempts: 1 }),
      },
      attendanceRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    devicesService = {
      authenticateDevice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: DevicesService, useValue: devicesService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkIn', () => {
    it('should throw UnauthorizedException if device authentication fails', async () => {
      devicesService.authenticateDevice.mockRejectedValue(
        new UnauthorizedException('Token máy POS không hợp lệ.'),
      );

      await expect(
        service.checkIn('Bearer invalid', {
          employeeCode: '1000001',
          pin: '1234',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should successfully check-in employee', async () => {
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-1',
        storeId: BigInt(1),
        store: { name: 'Store HCM' },
      });

      const pinHash = await CryptoUtil.hashPin('1234');
      prisma.user.findUnique.mockResolvedValue({
        id: BigInt(10),
        fullName: 'Nguyễn Văn Thu Ngân',
        employeeCode: BigInt(1000001),
        status: 'ACTIVE',
        homeStoreId: BigInt(1),
        pinCredential: {
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      prisma.attendanceRecord.findFirst.mockResolvedValue(null);
      prisma.attendanceRecord.create.mockResolvedValue({
        id: 'att-1',
        checkInAt: new Date('2026-09-21T08:00:00Z'),
      });

      const res = await service.checkIn('Bearer valid', {
        employeeCode: '1000001',
        pin: '1234',
      });

      expect(res.action).toBe('CHECK_IN');
      expect(res.employeeCode).toBe('1000001');
      expect(res.isSupport).toBe(false);
      expect(res.wasPreviousMissed).toBe(false);
    });

    it('does not let the first submitted PIN initialize a missing credential', async () => {
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-1',
        storeId: 1n,
        store: { name: 'Store HCM' },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 10n,
        status: 'ACTIVE',
        pinCredential: null,
      });

      await expect(
        service.checkIn('Device valid', {
          employeeCode: '1000001',
          pin: '1234',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.employeePinCredential.create).not.toHaveBeenCalled();
    });

    it('locks the PIN for 15 minutes on the fifth failed attendance attempt', async () => {
      prisma.employeePinCredential.update.mockResolvedValueOnce({
        failedAttempts: 5,
      });
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-1',
        storeId: 1n,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 10n,
        status: 'ACTIVE',
        homeStoreId: 1n,
        pinCredential: {
          pinHash: await CryptoUtil.hashPin('1234'),
          failedAttempts: 4,
          lockedUntil: null,
        },
      });

      await expect(
        service.checkIn('Device valid', {
          employeeCode: '1000001',
          pin: '9999',
        }),
      ).rejects.toThrow(UnauthorizedException);
      const attemptsUpdate =
        prisma.employeePinCredential.update.mock.calls[0][0];
      const lockUpdate = prisma.employeePinCredential.update.mock.calls[1][0];
      expect(attemptsUpdate.data.failedAttempts).toEqual({ increment: 1 });
      expect(lockUpdate.data.lockedUntil.getTime()).toBeGreaterThan(
        Date.now() + 14 * 60 * 1000,
      );
    });

    it('should flag isSupport = true if check-in at foreign store', async () => {
      devicesService.authenticateDevice.mockResolvedValue({
        id: 'dev-2',
        storeId: BigInt(2),
        store: { name: 'Store Da Nang' },
      });

      const pinHash = await CryptoUtil.hashPin('1234');
      prisma.user.findUnique.mockResolvedValue({
        id: BigInt(10),
        fullName: 'Nguyễn Văn Thu Ngân',
        employeeCode: BigInt(1000001),
        status: 'ACTIVE',
        homeStoreId: BigInt(1), // Home store khác Da Nang
        pinCredential: {
          pinHash,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      prisma.attendanceRecord.findFirst.mockResolvedValue(null);
      prisma.attendanceRecord.create.mockResolvedValue({
        id: 'att-2',
        checkInAt: new Date('2026-09-21T08:00:00Z'),
      });

      const res = await service.checkIn('Bearer valid', {
        employeeCode: '1000001',
        pin: '1234',
      });

      expect(res.action).toBe('CHECK_IN');
      expect(res.isSupport).toBe(true);
    });
  });

  describe('web admin attendance', () => {
    it('cho phép lấy danh sách chấm công có phân trang', async () => {
      prisma.attendanceRecord.count = jest.fn().mockResolvedValue(1);
      prisma.attendanceRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'att-uuid-1',
          userId: 10n,
          storeId: 1n,
          homeStoreIdAtCheckIn: 1n,
          isSupport: false,
          isMissedCheckout: false,
          isManualEntry: false,
          checkInAt: new Date('2026-10-08T08:00:00Z'),
          checkOutAt: new Date('2026-10-08T16:00:00Z'),
          user: {
            id: 10n,
            fullName: 'Lê Văn B',
            employeeCode: 1000002n,
            role: 'EMPLOYEE',
          },
          store: { id: 1n, name: 'Chi nhánh Q1' },
          homeStore: { id: 1n, name: 'Chi nhánh Q1' },
        },
      ]);

      const result = await service.getAttendanceRecords(
        { userId: '1', role: 'OWNER' },
        { page: 1, pageSize: 20 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].note).toBe('Đủ lượt');
      expect(result.items[0].employeeCode).toBe('1000002');
    });

    it('điều chỉnh ca chấm công thành công và tạo audit log', async () => {
      prisma.attendanceRecord.findUnique = jest.fn().mockResolvedValue({
        id: 'att-uuid-1',
        userId: 10n,
        storeId: 1n,
        homeStoreIdAtCheckIn: 1n,
        isSupport: false,
        isMissedCheckout: true,
        checkInAt: new Date('2026-10-08T08:00:00Z'),
        checkOutAt: null,
      });

      prisma.attendanceRecord.update = jest.fn().mockResolvedValue({
        id: 'att-uuid-1',
        userId: 10n,
        storeId: 1n,
        homeStoreIdAtCheckIn: 1n,
        isSupport: false,
        isMissedCheckout: false,
        isManualEntry: false,
        checkInAt: new Date('2026-10-08T08:00:00Z'),
        checkOutAt: new Date('2026-10-08T17:00:00Z'),
        user: {
          id: 10n,
          fullName: 'Lê Văn B',
          employeeCode: 1000002n,
          role: 'EMPLOYEE',
        },
        store: { id: 1n, name: 'Chi nhánh Q1' },
        homeStore: { id: 1n, name: 'Chi nhánh Q1' },
      });
      prisma.auditLog = { create: jest.fn().mockResolvedValue({ id: 1n }) };

      const result = await service.adjustAttendance(
        { userId: '1', role: 'OWNER' },
        'att-uuid-1',
        {
          checkOutAt: '2026-10-08T17:00:00Z',
          reason: 'Nhân viên quên check-out, đã xác minh camera',
        },
      );

      expect(result.isMissedCheckout).toBe(false);
      expect(result.note).toBe('Đủ lượt');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
