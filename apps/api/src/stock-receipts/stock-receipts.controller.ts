import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import { StockReceiptsService } from './stock-receipts.service';
import {
  CreateStockReceiptDto,
  ImportCsvReceiptDto,
  PaginatedStockReceiptsResponseDto,
  QueryStockReceiptsDto,
  RejectStockReceiptDto,
  StockReceiptResponseDto,
  UpdateStockReceiptDto,
} from './dto/stock-receipts.dto';

@ApiTags('Stock Receipts (Nhập hàng & Phiếu kho)')
@Controller()
export class StockReceiptsController {
  constructor(private readonly stockReceiptsService: StockReceiptsService) {}

  @Post('stores/:storeId/stock-receipts')
  @ApiOperation({
    summary: 'Tạo phiếu nhập kho thủ công (DRAFT)',
    description:
      'Lập phiếu nhập nguyên liệu từ NCC hoặc Kho nguồn theo phương án lai A2. Chỉ Owner hoặc SM chi nhánh nhà mới có quyền.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token> quản trị',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Phiếu nhập nháp tạo thành công',
    type: StockReceiptResponseDto,
  })
  async createReceipt(
    @Headers('authorization') authHeader: string | undefined,
    @Param('storeId') storeId: string,
    @Body() dto: CreateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    const targetStoreId = BigInt(storeId);
    const principal = WebPrincipalUtil.requireOwnerOrManager(
      authHeader,
      targetStoreId,
    );
    return this.stockReceiptsService.createReceipt(
      principal,
      targetStoreId,
      dto,
    );
  }

  @Post('stores/:storeId/stock-receipts/import-csv')
  @ApiOperation({
    summary: 'Import danh sách dòng nguyên liệu từ file CSV (DRAFT)',
    description:
      'Tải lên nội dung CSV, mapping mã nguyên liệu, kiểm tra lỗi dòng và tạo phiếu nháp.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token> quản trị',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Phiếu nhập nháp tạo từ CSV thành công',
    type: StockReceiptResponseDto,
  })
  async importCsv(
    @Headers('authorization') authHeader: string | undefined,
    @Param('storeId') storeId: string,
    @Body() dto: ImportCsvReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    const targetStoreId = BigInt(storeId);
    const principal = WebPrincipalUtil.requireOwnerOrManager(
      authHeader,
      targetStoreId,
    );
    return this.stockReceiptsService.importCsvReceipt(
      principal,
      targetStoreId,
      dto,
    );
  }

  @Get('stores/:storeId/stock-receipts')
  @ApiOperation({
    summary: 'Danh sách phiếu nhập kho của chi nhánh',
    description: 'Xem lịch sử các phiếu nhập có phân trang và bộ lọc.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token> quản trị',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách phiếu nhập',
    type: PaginatedStockReceiptsResponseDto,
  })
  async listReceipts(
    @Headers('authorization') authHeader: string | undefined,
    @Param('storeId') storeId: string,
    @Query() query: QueryStockReceiptsDto,
  ): Promise<PaginatedStockReceiptsResponseDto> {
    const targetStoreId = BigInt(storeId);
    const principal = WebPrincipalUtil.requireOwnerOrManager(
      authHeader,
      targetStoreId,
    );
    return this.stockReceiptsService.getReceiptsByStore(
      principal,
      targetStoreId,
      query,
    );
  }

  @Get('stock-receipts/:id')
  @ApiOperation({
    summary: 'Xem chi tiết một phiếu nhập kho',
    description: 'Chi tiết thông tin phiếu và từng dòng nguyên liệu.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token> quản trị',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết phiếu nhập',
    type: StockReceiptResponseDto,
  })
  async getReceiptById(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') receiptId: string,
  ): Promise<StockReceiptResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.stockReceiptsService.getReceiptById(principal, receiptId);
  }

  @Patch('stock-receipts/:id')
  @ApiOperation({
    summary: 'Cập nhật phiếu nhập nháp (DRAFT/REVIEWED)',
    description:
      'Chỉnh sửa số lượng thực nhận, đơn giá hoặc ghi chú khi chưa đăng kho.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token> quản trị',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Phiếu nhập cập nhật thành công',
    type: StockReceiptResponseDto,
  })
  async updateReceipt(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') receiptId: string,
    @Body() dto: UpdateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.stockReceiptsService.updateReceipt(principal, receiptId, dto);
  }

  @Post('stock-receipts/:id/post')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng kho chính thức (POSTED)',
    description:
      'Chuyển trạng thái phiếu sang POSTED, thực hiện cập nhật tồn kho nguyên tử, ghi nhận biến động RECEIPT và tạo sync_changes cho POS.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token> quản trị',
    required: true,
  })
  @ApiHeader({
    name: 'idempotency-key',
    description: 'Khóa chống lặp request (UUID)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Đăng kho thành công',
    type: StockReceiptResponseDto,
  })
  async postReceipt(
    @Headers('authorization') authHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') receiptId: string,
  ): Promise<StockReceiptResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.stockReceiptsService.postReceiptToStock(
      principal,
      receiptId,
      idempotencyKey,
    );
  }

  @Post('stock-receipts/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối / Hủy phiếu nhập kho (REJECTED)',
    description:
      'Đánh dấu phiếu bị từ chối kèm lý do. Không tác động đến số dư kho.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token> quản trị',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Từ chối phiếu thành công',
    type: StockReceiptResponseDto,
  })
  async rejectReceipt(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') receiptId: string,
    @Body() dto: RejectStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.stockReceiptsService.rejectReceipt(principal, receiptId, dto);
  }
}
