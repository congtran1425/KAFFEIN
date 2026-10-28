import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateStockReceiptLineDto {
  @ApiProperty({ description: 'ID nguyên liệu (BigInt string)', example: '1' })
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({
    description: 'Số lượng thực nhận theo đơn vị cơ sở (G, ML, PIECE)',
    example: 5000,
  })
  @IsNumber()
  @Min(0.001, { message: 'Số lượng nhập phải lớn hơn 0' })
  receivedQuantity: number;

  @ApiProperty({
    description: 'Đơn giá vốn trên 1 đơn vị cơ sở (VND)',
    example: 180,
  })
  @IsNumber()
  @Min(0, { message: 'Đơn giá không được âm' })
  unitCostVnd: number;

  @ApiPropertyOptional({
    description: 'Ghi chú cho dòng',
    example: 'Bao 5kg hạt',
  })
  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateStockReceiptDto {
  @ApiProperty({
    description: 'Loại nguồn giao hàng',
    enum: ['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'],
    example: 'EXTERNAL_SUPPLIER',
  })
  @IsEnum(['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'], {
    message:
      'Nguồn hàng phải là EXTERNAL_SUPPLIER hoặc CENTRAL_WAREHOUSE_UNTRACKED',
  })
  sourceType: 'EXTERNAL_SUPPLIER' | 'CENTRAL_WAREHOUSE_UNTRACKED';

  @ApiProperty({
    description: 'Tên nhà cung cấp hoặc Tên kho cấp',
    example: 'Công ty TNHH Bánh Tươi Sài Gòn',
  })
  @IsString()
  @IsNotEmpty()
  sourceName: string;

  @ApiPropertyOptional({
    description: 'Số hóa đơn hoặc số phiếu giao hàng',
    example: 'HD-2026/08912',
  })
  @IsString()
  @IsOptional()
  documentNo?: string;

  @ApiPropertyOptional({
    description: 'Ngày chứng từ (ISO date string)',
    example: '2026-10-09T08:00:00.000Z',
  })
  @IsString()
  @IsOptional()
  documentDate?: string;

  @ApiPropertyOptional({ description: 'Ghi chú tổng thể cho phiếu' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty({
    description: 'Danh sách các dòng nguyên liệu nhập',
    type: [CreateStockReceiptLineDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockReceiptLineDto)
  lines: CreateStockReceiptLineDto[];
}

export class UpdateStockReceiptDto {
  @ApiPropertyOptional({
    description: 'Loại nguồn giao hàng',
    enum: ['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'],
  })
  @IsEnum(['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'])
  @IsOptional()
  sourceType?: 'EXTERNAL_SUPPLIER' | 'CENTRAL_WAREHOUSE_UNTRACKED';

  @ApiPropertyOptional({ description: 'Tên nhà cung cấp hoặc Kho cấp' })
  @IsString()
  @IsOptional()
  sourceName?: string;

  @ApiPropertyOptional({ description: 'Số hóa đơn / chứng từ' })
  @IsString()
  @IsOptional()
  documentNo?: string;

  @ApiPropertyOptional({ description: 'Ngày chứng từ' })
  @IsString()
  @IsOptional()
  documentDate?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    description: 'Danh sách dòng nguyên liệu cập nhật',
    type: [CreateStockReceiptLineDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockReceiptLineDto)
  @IsOptional()
  lines?: CreateStockReceiptLineDto[];
}

export class RejectStockReceiptDto {
  @ApiProperty({
    description: 'Lý do từ chối phiếu nhập',
    example: 'Bao bì bị rách và ẩm ướt khi nhận hàng',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ImportCsvReceiptDto {
  @ApiProperty({
    description: 'Loại nguồn giao hàng',
    enum: ['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'],
    example: 'EXTERNAL_SUPPLIER',
  })
  @IsEnum(['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'])
  sourceType: 'EXTERNAL_SUPPLIER' | 'CENTRAL_WAREHOUSE_UNTRACKED';

  @ApiProperty({
    description: 'Tên nhà cung cấp hoặc Kho cấp',
    example: 'Tổng kho phân phối Bình Dương',
  })
  @IsString()
  @IsNotEmpty()
  sourceName: string;

  @ApiPropertyOptional({ description: 'Số hóa đơn / chứng từ' })
  @IsString()
  @IsOptional()
  documentNo?: string;

  @ApiPropertyOptional({ description: 'Ngày chứng từ' })
  @IsString()
  @IsOptional()
  documentDate?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty({
    description:
      'Nội dung thô file CSV (Cột: ingredient_code, received_quantity, unit_cost_vnd, note)',
  })
  @IsString()
  @IsNotEmpty()
  csvContent: string;
}

export class QueryStockReceiptsDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái phiếu',
    enum: ['DRAFT', 'REVIEWED', 'POSTED', 'REJECTED'],
  })
  @IsEnum(['DRAFT', 'REVIEWED', 'POSTED', 'REJECTED'])
  @IsOptional()
  status?: 'DRAFT' | 'REVIEWED' | 'POSTED' | 'REJECTED';

  @ApiPropertyOptional({
    description: 'Lọc theo loại nguồn',
    enum: ['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'],
  })
  @IsEnum(['EXTERNAL_SUPPLIER', 'CENTRAL_WAREHOUSE_UNTRACKED'])
  @IsOptional()
  sourceType?: 'EXTERNAL_SUPPLIER' | 'CENTRAL_WAREHOUSE_UNTRACKED';

  @ApiPropertyOptional({ description: 'Từ ngày (ISO date)' })
  @IsString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO date)' })
  @IsString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Số trang (1-indexed)', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Kích thước trang', default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  pageSize?: number = 20;
}

export class StockReceiptLineResponseDto {
  @ApiProperty({ description: 'ID dòng phiếu nhập' })
  id: string;

  @ApiProperty({ description: 'ID nguyên liệu' })
  ingredientId: string;

  @ApiProperty({ description: 'Mã nguyên liệu', example: 'ING_COFFEE_ROBUSTA' })
  ingredientCode: string;

  @ApiProperty({
    description: 'Tên nguyên liệu',
    example: 'Hạt cà phê Robusta Pleiku',
  })
  ingredientName: string;

  @ApiProperty({ description: 'Số thứ tự dòng' })
  lineNumber: number;

  @ApiProperty({ description: 'Số lượng nhận thực tế' })
  receivedQuantity: number;

  @ApiProperty({ description: 'Đơn vị tính cơ sở (G, ML, PIECE)' })
  baseUnit: string;

  @ApiProperty({ description: 'Đơn vị đơn giá vốn (VND)' })
  unitCostVnd: string;

  @ApiProperty({ description: 'Thành tiền dòng (VND)' })
  lineTotalVnd: string;

  @ApiPropertyOptional({ description: 'Ghi chú dòng' })
  note: string | null;

  @ApiPropertyOptional({ description: 'Cảnh báo/lỗi kiểm tra dòng' })
  validationErrors: string | null;
}

export class StockReceiptResponseDto {
  @ApiProperty({ description: 'ID phiếu nhập' })
  id: string;

  @ApiProperty({ description: 'ID chi nhánh nhận' })
  storeId: string;

  @ApiProperty({
    description: 'Mã phiếu nhập sinh tự động',
    example: 'REC-20261009-0001',
  })
  receiptCode: string;

  @ApiProperty({ description: 'Loại nguồn giao hàng' })
  sourceType: string;

  @ApiProperty({ description: 'Tên nguồn giao hàng' })
  sourceName: string;

  @ApiPropertyOptional({ description: 'Số chứng từ / hóa đơn đính kèm' })
  documentNo: string | null;

  @ApiPropertyOptional({ description: 'Ngày chứng từ' })
  documentDate: string | null;

  @ApiProperty({
    description: 'Trạng thái phiếu (DRAFT, REVIEWED, POSTED, REJECTED)',
  })
  status: string;

  @ApiProperty({ description: 'Tổng tiền phiếu nhập (VND)' })
  totalCostVnd: string;

  @ApiPropertyOptional({ description: 'Idempotency key chống trùng' })
  idempotencyKey: string | null;

  @ApiPropertyOptional({ description: 'Ghi chú phiếu' })
  note: string | null;

  @ApiPropertyOptional({ description: 'Lý do từ chối nếu bị REJECTED' })
  rejectionReason: string | null;

  @ApiProperty({ description: 'ID người tạo' })
  createdByUserId: string;

  @ApiProperty({ description: 'Tên người tạo' })
  createdByName: string;

  @ApiPropertyOptional({ description: 'ID người kiểm tra' })
  reviewedByUserId: string | null;

  @ApiPropertyOptional({ description: 'Tên người kiểm tra' })
  reviewedByName: string | null;

  @ApiPropertyOptional({ description: 'ID người đăng kho' })
  postedByUserId: string | null;

  @ApiPropertyOptional({ description: 'Tên người đăng kho' })
  postedByName: string | null;

  @ApiPropertyOptional({ description: 'Thời điểm đăng kho chính thức' })
  postedAt: string | null;

  @ApiProperty({ description: 'Thời điểm tạo' })
  createdAt: string;

  @ApiProperty({ description: 'Thời điểm cập nhật' })
  updatedAt: string;

  @ApiProperty({
    description: 'Danh sách các dòng nguyên liệu nhập',
    type: [StockReceiptLineResponseDto],
  })
  lines: StockReceiptLineResponseDto[];
}

export class StockReceiptListItemDto {
  @ApiProperty({ description: 'ID phiếu nhập' })
  id: string;

  @ApiProperty({ description: 'ID chi nhánh nhận' })
  storeId: string;

  @ApiProperty({ description: 'Mã phiếu nhập', example: 'REC-20261009-0001' })
  receiptCode: string;

  @ApiProperty({ description: 'Loại nguồn giao' })
  sourceType: string;

  @ApiProperty({ description: 'Tên nguồn giao' })
  sourceName: string;

  @ApiPropertyOptional({ description: 'Số chứng từ' })
  documentNo: string | null;

  @ApiPropertyOptional({ description: 'Ngày chứng từ' })
  documentDate: string | null;

  @ApiProperty({ description: 'Trạng thái phiếu' })
  status: string;

  @ApiProperty({ description: 'Tổng tiền phiếu nhập (VND)' })
  totalCostVnd: string;

  @ApiProperty({ description: 'Số dòng nguyên liệu' })
  lineCount: number;

  @ApiProperty({ description: 'Người tạo' })
  createdByName: string;

  @ApiPropertyOptional({ description: 'Người đăng kho' })
  postedByName: string | null;

  @ApiPropertyOptional({ description: 'Thời điểm đăng kho' })
  postedAt: string | null;

  @ApiProperty({ description: 'Thời điểm tạo phiếu' })
  createdAt: string;
}

export class PaginatedStockReceiptsResponseDto {
  @ApiProperty({
    description: 'Danh sách phiếu nhập',
    type: [StockReceiptListItemDto],
  })
  items: StockReceiptListItemDto[];

  @ApiProperty({ description: 'Tổng số phiếu thỏa mãn điều kiện' })
  total: number;

  @ApiProperty({ description: 'Trang hiện tại' })
  page: number;

  @ApiProperty({ description: 'Kích thước trang' })
  pageSize: number;

  @ApiProperty({ description: 'Tổng số trang' })
  totalPages: number;
}
