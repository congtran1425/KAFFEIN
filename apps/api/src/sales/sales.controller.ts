import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleResponseDto } from './dto/sale-response.dto';
import {
  PaginatedSalesResponseDto,
  QuerySalesDto,
} from './dto/query-sales.dto';
import { SalesService } from './sales.service';

@ApiTags('Sales')
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo và hoàn tất đơn hàng bán lẻ tại quầy',
    description:
      'Ghi nhận đơn bán hàng, lưu snapshot giá & thuế VAT, tính toán snapshot định mức tiêu hao nguyên liệu và trừ tồn kho tức thời trong 1 giao dịch nguyên tử.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Đơn hàng được hoàn tất và trừ kho thành công.',
    type: SaleResponseDto,
  })
  async createSale(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateSaleDto,
  ): Promise<SaleResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.salesService.completeSale(device.storeId, device.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách hóa đơn bán hàng (Web Owner / Store Manager)',
    description:
      'Chỉ liệt kê hóa đơn PAID; lọc và sắp xếp theo thời điểm hoàn tất. Lọc theo chi nhánh, phương thức thanh toán đã thành công và mã hóa đơn. Phân quyền: Owner xem toàn chuỗi, Store Manager chỉ xem chi nhánh nhà.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách hóa đơn bán hàng có phân trang',
    type: PaginatedSalesResponseDto,
  })
  async getSales(
    @Headers('authorization') authHeader: string | undefined,
    @Query() query: QuerySalesDto,
  ): Promise<PaginatedSalesResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);

    return this.salesService.getSales({
      requestingRole: principal.role,
      requestingHomeStoreId: principal.homeStoreId
        ? BigInt(principal.homeStoreId)
        : undefined,
      targetStoreId: query.storeId ? BigInt(query.storeId) : undefined,
      page: query.page ? parseInt(query.page, 10) : 1,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 20,
      search: query.search,
      paymentMethod: query.paymentMethod,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết đơn hàng và biên lai' })
  @ApiHeader({
    name: 'authorization',
    description:
      'Device credential (Device <credential>) hoặc Web Manager/Owner token (Bearer <token>)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết đơn hàng',
    type: SaleResponseDto,
  })
  async getSale(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
  ): Promise<SaleResponseDto> {
    if (authHeader && authHeader.startsWith('Device ')) {
      const device = await this.devicesService.authenticateDevice(authHeader);
      return this.salesService.getSaleById(id, device.storeId);
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const principal = WebPrincipalUtil.parseToken(authHeader);
      if (principal.role === 'OWNER') {
        return this.salesService.getSaleById(id);
      }
      return this.salesService.getSaleById(
        id,
        principal.homeStoreId ? BigInt(principal.homeStoreId) : undefined,
      );
    }

    throw new UnauthorizedException(
      'Cần xác thực thiết bị (Device <credential>) hoặc tài khoản quản trị (Bearer <token>) để xem biên lai.',
    );
  }
}
