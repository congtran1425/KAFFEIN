import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CryptoUtil } from '../common/security/crypto.util';
import { PrismaService } from '../database/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService owner credential management', () => {
  const owner = { userId: '1', role: 'OWNER' as const };
  let prisma: any;
  let service: EmployeesService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1n, role: 'OWNER', status: 'ACTIVE' }),
        create: jest.fn(),
        update: jest.fn(),
      },
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 2n, status: 'ACTIVE' }),
      },
      webCredential: { findFirst: jest.fn().mockResolvedValue(null) },
      employeePinCredential: { upsert: jest.fn() },
      cashierSession: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    service = new EmployeesService(prisma as PrismaService);
  });

  it('creates an employee with the database-allocated code, hashed PIN and audit record', async () => {
    prisma.user.create.mockResolvedValue({
      id: 3n,
      employeeCode: 1000701n,
      fullName: 'Tran A',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      homeStoreId: 2n,
      homeStore: { name: 'Store 2', code: 'S02' },
      createdAt: new Date('2026-10-09T00:00:00.000Z'),
    });

    const result = await service.createEmployee(owner, {
      fullName: ' Tran A ',
      role: 'EMPLOYEE',
      homeStoreId: '2',
      pin: '0123',
    });

    expect(result.employeeCode).toBe('1000701');
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.fullName).toBe('Tran A');
    expect(data.pinCredential.create.pinHash).not.toContain('0123');
    expect(
      await CryptoUtil.verifyPin(
        '0123',
        data.pinCredential.create.pinHash as string,
      ),
    ).toBe(true);
    expect(data.webCredential).toBeUndefined();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EMPLOYEE_CREATED' }),
      }),
    );
  });

  it('requires email and web password for a store manager', async () => {
    await expect(
      service.createEmployee(owner, {
        fullName: 'Tran B',
        role: 'STORE_MANAGER',
        homeStoreId: '2',
        pin: '1234',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('lists the stored Owner and staff codes independently of internal user IDs', async () => {
    prisma.user.count = jest.fn().mockResolvedValue(2);
    prisma.user.findMany = jest.fn().mockResolvedValue([
      {
        id: 99n,
        employeeCode: 1000001n,
        fullName: 'Owner',
        role: 'OWNER',
        status: 'ACTIVE',
        homeStoreId: null,
        createdAt: new Date(),
      },
      {
        id: 100n,
        employeeCode: 1000701n,
        fullName: 'Manager Q1',
        role: 'STORE_MANAGER',
        status: 'ACTIVE',
        homeStoreId: 2n,
        createdAt: new Date(),
      },
    ]);
    const result = await service.listEmployees(owner, {
      page: 1,
      pageSize: 50,
    });
    expect(result.items.map((item) => item.employeeCode)).toEqual([
      '1000001',
      '1000701',
    ]);
    expect(new Set(result.items.map((item) => item.employeeCode)).size).toBe(2);
  });

  it('rejects duplicate email before writing the employee', async () => {
    prisma.webCredential.findFirst.mockResolvedValue({ userId: 9n });
    await expect(
      service.createEmployee(owner, {
        fullName: 'Tran B',
        role: 'STORE_MANAGER',
        homeStoreId: '2',
        pin: '1234',
        email: 'b@example.com',
        webPassword: 'a-long-password',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('revokes active cashier sessions when resetting a PIN', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1n, role: 'OWNER', status: 'ACTIVE' })
      .mockResolvedValueOnce({
        id: 3n,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        homeStoreId: 2n,
      });
    prisma.employeePinCredential.upsert.mockResolvedValue({ pinVersion: 2 });

    const result = await service.resetPin(owner, '3', { pin: '5678' });

    expect(result).toEqual({ employeeId: '3', pinVersion: 2 });
    expect(prisma.cashierSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 3n, status: 'ACTIVE' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EMPLOYEE_PIN_RESET' }),
      }),
    );
  });

  it('does not allow a store manager to create employees', async () => {
    await expect(
      service.createEmployee(
        { userId: '2', role: 'STORE_MANAGER', homeStoreId: '2' },
        {
          fullName: 'Tran C',
          role: 'EMPLOYEE',
          homeStoreId: '2',
          pin: '1234',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('suspends an employee, revokes cashier sessions and audits the change', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1n, role: 'OWNER', status: 'ACTIVE' })
      .mockResolvedValueOnce({
        id: 3n,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        homeStoreId: 2n,
        fullName: 'Tran A',
      });
    prisma.user.update.mockResolvedValue({
      id: 3n,
      employeeCode: 1000701n,
      fullName: 'Tran A',
      role: 'EMPLOYEE',
      status: 'SUSPENDED',
      homeStoreId: 2n,
      homeStore: { name: 'Store 2', code: 'S02' },
      createdAt: new Date('2026-10-09T00:00:00.000Z'),
    });
    const result = await service.updateEmployee(owner, '3', {
      status: 'SUSPENDED',
    });
    expect(result.status).toBe('SUSPENDED');
    expect(prisma.cashierSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 3n, status: 'ACTIVE' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EMPLOYEE_UPDATED' }),
      }),
    );
  });

  it('does not reactivate a terminated employee', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1n, role: 'OWNER', status: 'ACTIVE' })
      .mockResolvedValueOnce({
        id: 3n,
        role: 'EMPLOYEE',
        status: 'TERMINATED',
      });
    await expect(
      service.updateEmployee(owner, '3', { status: 'ACTIVE' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not allow an SM to edit another employee', async () => {
    await expect(
      service.updateEmployee(
        { userId: '2', role: 'STORE_MANAGER', homeStoreId: '2' },
        '3',
        { status: 'SUSPENDED' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
