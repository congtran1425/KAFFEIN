import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../database/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    sale: { findMany: jest.Mock };
    stockBalance: { count: jest.Mock };
    saleItem: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      sale: { findMany: jest.fn() },
      stockBalance: { count: jest.fn() },
      saleItem: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('getDashboard', () => {
    it('từ chối Store Manager nếu truy vấn chi nhánh khác', async () => {
      await expect(
        service.getDashboard({
          requestingRole: 'STORE_MANAGER',
          requestingHomeStoreId: 101n,
          targetStoreId: 102n,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('tính toán đúng KPI và phân bố doanh thu cho Owner', async () => {
      prisma.sale.findMany.mockResolvedValue([
        {
          id: 'sale-1',
          totalVnd: 50000n,
          createdAt: new Date('2026-10-08T08:15:00+07:00'),
          completedAt: new Date('2026-10-08T08:15:00+07:00'),
        },
        {
          id: 'sale-2',
          totalVnd: 70000n,
          createdAt: new Date('2026-10-08T08:45:00+07:00'),
          completedAt: new Date('2026-10-08T08:45:00+07:00'),
        },
      ]);

      prisma.stockBalance.count.mockResolvedValue(2);
      prisma.saleItem.findMany.mockResolvedValue([
        {
          productId: 1n,
          productNameSnapshot: 'Cà phê sữa đá',
          variantNameSnapshot: 'M',
          quantity: 2,
          lineTotalVnd: 70000n,
        },
      ]);

      const res = await service.getDashboard({
        requestingRole: 'OWNER',
        date: '2026-10-08',
      });

      expect(res.kpi.todayRevenueVnd).toBe('120000');
      expect(res.kpi.todayOrderCount).toBe(2);
      expect(res.kpi.averageOrderValueVnd).toBe('60000');
      expect(res.kpi.stockAlertCount).toBe(2);
      expect(prisma.stockBalance.count).toHaveBeenCalledWith({
        where: { quantity: { lte: 0 } },
      });

      const hour8 = res.hourlyRevenue.find((h) => h.hourLabel === '08:00');
      expect(hour8).toBeDefined();
      expect(hour8?.revenueVnd).toBe('120000');
      expect(hour8?.orderCount).toBe(2);

      expect(res.topProducts).toHaveLength(1);
      expect(res.topProducts[0].productName).toBe('Cà phê sữa đá');
      expect(res.topProducts[0].quantitySold).toBe(2);
    });
  });
});
