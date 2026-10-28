import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QuerySalesDto {
  @ApiPropertyOptional({
    description:
      'ID chi nhánh cần xem (Chủ chuỗi xem được mọi chi nhánh, Quản lý chỉ xem chi nhánh nhà)',
  })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Số trang (bắt đầu từ 1)', default: 1 })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Số mục trên mỗi trang', default: 20 })
  @IsOptional()
  @IsString()
  pageSize?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã hóa đơn (saleNumber)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['CASH', 'ZALOPAY', 'MOMO'],
    description: 'Phương thức thanh toán',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (ISO string hoặc YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO string hoặc YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  toDate?: string;
}

export class SaleSummaryItemDto {
  id!: string;
  saleNumber!: string;
  storeId!: string;
  storeName!: string;
  cashierName!: string;
  status!: string;
  subtotalVnd!: string;
  taxVnd!: string;
  totalVnd!: string;
  completedAt!: string | null;
  createdAt!: string;
  paymentMethod!: string;
  itemCount!: number;
}

export class PaginatedSalesResponseDto {
  items!: SaleSummaryItemDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}
