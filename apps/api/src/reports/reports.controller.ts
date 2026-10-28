import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import {
  DashboardResponseDto,
  QueryDashboardDto,
  QueryTopProductsDto,
  TopProductDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports & Analytics')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Chỉ số tổng quan điều hành Dashboard (KPI, Biểu đồ doanh thu, Tồn kho)',
    description:
      'Tổng hợp số liệu thời gian thực trong ngày theo múi giờ Việt Nam (Asia/Ho_Chi_Minh). Phân quyền tự động: Owner xem toàn chuỗi hoặc 1 chi nhánh; Store Manager chỉ xem chi nhánh nhà.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Dữ liệu dashboard tổng quan',
    type: DashboardResponseDto,
  })
  async getDashboard(
    @Headers('authorization') authHeader: string | undefined,
    @Query() query: QueryDashboardDto,
  ): Promise<DashboardResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);

    return this.reportsService.getDashboard({
      requestingRole: principal.role,
      requestingHomeStoreId: principal.homeStoreId
        ? BigInt(principal.homeStoreId)
        : undefined,
      targetStoreId: query.storeId ? BigInt(query.storeId) : undefined,
      date: query.date,
    });
  }

  @Get('top-products')
  @ApiOperation({
    summary: 'Danh sách Top sản phẩm bán chạy nhất trong ngày',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Top món bán chạy',
    type: [TopProductDto],
  })
  async getTopProducts(
    @Headers('authorization') authHeader: string | undefined,
    @Query() query: QueryTopProductsDto,
  ): Promise<TopProductDto[]> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);

    return this.reportsService.getTopProducts({
      requestingRole: principal.role,
      requestingHomeStoreId: principal.homeStoreId
        ? BigInt(principal.homeStoreId)
        : undefined,
      targetStoreId: query.storeId ? BigInt(query.storeId) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : 5,
    });
  }
}
