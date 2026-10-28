import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryDashboardDto {
  @ApiPropertyOptional({
    description:
      'ID chi nhánh (nếu không truyền và là Owner thì xem toàn chuỗi)',
  })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Ngày kinh doanh (YYYY-MM-DD), mặc định là hôm nay',
  })
  @IsOptional()
  @IsString()
  date?: string;
}

export class QueryTopProductsDto {
  @ApiPropertyOptional({ description: 'ID chi nhánh' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Số lượng top sản phẩm (mặc định 5)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class HourlyRevenueDto {
  @ApiProperty({ example: '08:00' })
  hourLabel!: string;

  @ApiProperty({ example: '1250000' })
  revenueVnd!: string;

  @ApiProperty({ example: 28 })
  orderCount!: number;
}

export class TopProductDto {
  @ApiProperty({ example: '1' })
  productId!: string;

  @ApiProperty({ example: 'Cà phê sữa đá' })
  productName!: string;

  @ApiProperty({ example: 'M' })
  variantName!: string;

  @ApiProperty({ example: 124 })
  quantitySold!: number;

  @ApiProperty({ example: '4340000' })
  totalRevenueVnd!: string;
}

export class DashboardKpiDto {
  @ApiProperty({ example: '18420000' })
  todayRevenueVnd!: string;

  @ApiProperty({ example: 428 })
  todayOrderCount!: number;

  @ApiProperty({ example: '43037' })
  averageOrderValueVnd!: string;

  @ApiProperty({ example: 3 })
  stockAlertCount!: number;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardKpiDto })
  kpi!: DashboardKpiDto;

  @ApiProperty({ type: [HourlyRevenueDto] })
  hourlyRevenue!: HourlyRevenueDto[];

  @ApiProperty({ type: [TopProductDto] })
  topProducts!: TopProductDto[];
}
