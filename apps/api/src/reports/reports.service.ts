import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DashboardResponseDto,
  HourlyRevenueDto,
  TopProductDto,
} from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private getVnDateRange(dateStr?: string): {
    startUtc: Date;
    endUtc: Date;
    businessDate: Date;
  } {
    let baseDate: Date;
    if (dateStr) {
      baseDate = new Date(`${dateStr}T00:00:00+07:00`);
    } else {
      baseDate = new Date();
    }

    const vnDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(baseDate);

    const startUtc = new Date(`${vnDateStr}T00:00:00+07:00`);
    const endUtc = new Date(`${vnDateStr}T23:59:59.999+07:00`);
    const businessDate = new Date(`${vnDateStr}T00:00:00.000Z`);

    return { startUtc, endUtc, businessDate };
  }

  async getDashboard(options: {
    requestingRole: 'OWNER' | 'STORE_MANAGER';
    requestingHomeStoreId?: bigint;
    targetStoreId?: bigint;
    date?: string;
  }): Promise<DashboardResponseDto> {
    let filterStoreId: bigint | undefined;

    if (options.requestingRole === 'STORE_MANAGER') {
      if (!options.requestingHomeStoreId) {
        throw new ForbiddenException('Tài khoản không được gán chi nhánh nhà.');
      }
      if (
        options.targetStoreId &&
        options.targetStoreId !== options.requestingHomeStoreId
      ) {
        throw new ForbiddenException(
          'Không có quyền xem dữ liệu của chi nhánh khác.',
        );
      }
      filterStoreId = options.requestingHomeStoreId;
    } else {
      if (options.targetStoreId) {
        filterStoreId = options.targetStoreId;
      }
    }

    const { startUtc, endUtc } = this.getVnDateRange(options.date);

    // 1. Lấy danh sách đơn bán hàng hoàn tất trong ngày
    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'PAID',
        ...(filterStoreId ? { storeId: filterStoreId } : {}),
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
      },
      select: {
        id: true,
        totalVnd: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalRevenue = 0n;
    sales.forEach((s) => {
      totalRevenue += s.totalVnd;
    });

    const orderCount = sales.length;
    const aov =
      orderCount > 0 ? Math.round(Number(totalRevenue) / orderCount) : 0;

    // No universal low-stock threshold exists across g/ml/piece. Report only zero stock.
    const stockAlertCount = await this.prisma.stockBalance.count({
      where: {
        ...(filterStoreId ? { storeId: filterStoreId } : {}),
        quantity: { lte: 0 },
      },
    });

    // 3. Doanh thu theo khung giờ (06:00 đến 22:00)
    const hourlyMap = new Map<number, { revenue: bigint; count: number }>();
    for (let h = 6; h <= 22; h++) {
      hourlyMap.set(h, { revenue: 0n, count: 0 });
    }

    const vnFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      hour12: false,
    });

    sales.forEach((s) => {
      const dateToUse = s.completedAt || s.createdAt;
      const hourStr = vnFormatter.format(dateToUse);
      const hour = parseInt(hourStr, 10);
      if (hourlyMap.has(hour)) {
        const current = hourlyMap.get(hour)!;
        current.revenue += s.totalVnd;
        current.count += 1;
      }
    });

    const hourlyRevenue: HourlyRevenueDto[] = [];
    for (let h = 6; h <= 22; h++) {
      const entry = hourlyMap.get(h)!;
      const label = `${String(h).padStart(2, '0')}:00`;
      hourlyRevenue.push({
        hourLabel: label,
        revenueVnd: entry.revenue.toString(),
        orderCount: entry.count,
      });
    }

    // 4. Top sản phẩm bán chạy trong ngày
    const topProducts = await this.getTopProducts({
      requestingRole: options.requestingRole,
      requestingHomeStoreId: options.requestingHomeStoreId,
      targetStoreId: options.targetStoreId,
      limit: 5,
      date: options.date,
    });

    return {
      kpi: {
        todayRevenueVnd: totalRevenue.toString(),
        todayOrderCount: orderCount,
        averageOrderValueVnd: aov.toString(),
        stockAlertCount,
      },
      hourlyRevenue,
      topProducts,
    };
  }

  async getTopProducts(options: {
    requestingRole: 'OWNER' | 'STORE_MANAGER';
    requestingHomeStoreId?: bigint;
    targetStoreId?: bigint;
    limit?: number;
    date?: string;
  }): Promise<TopProductDto[]> {
    let filterStoreId: bigint | undefined;

    if (options.requestingRole === 'STORE_MANAGER') {
      filterStoreId = options.requestingHomeStoreId;
    } else if (options.targetStoreId) {
      filterStoreId = options.targetStoreId;
    }

    const { startUtc, endUtc } = this.getVnDateRange(options.date);

    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          status: 'PAID',
          ...(filterStoreId ? { storeId: filterStoreId } : {}),
          createdAt: {
            gte: startUtc,
            lte: endUtc,
          },
        },
      },
      select: {
        productId: true,
        productNameSnapshot: true,
        variantNameSnapshot: true,
        quantity: true,
        lineTotalVnd: true,
      },
    });

    const map = new Map<
      string,
      {
        productId: string;
        productName: string;
        variantName: string;
        quantitySold: number;
        totalRevenue: bigint;
      }
    >();

    saleItems.forEach((item) => {
      const key = `${item.productId}_${item.variantNameSnapshot}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantitySold += item.quantity;
        existing.totalRevenue += item.lineTotalVnd;
      } else {
        map.set(key, {
          productId: item.productId.toString(),
          productName: item.productNameSnapshot,
          variantName: item.variantNameSnapshot,
          quantitySold: item.quantity,
          totalRevenue: item.lineTotalVnd,
        });
      }
    });

    const sorted = Array.from(map.values()).sort(
      (a, b) => b.quantitySold - a.quantitySold,
    );

    const limit = options.limit || 5;
    return sorted.slice(0, limit).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      variantName: p.variantName,
      quantitySold: p.quantitySold,
      totalRevenueVnd: p.totalRevenue.toString(),
    }));
  }
}
