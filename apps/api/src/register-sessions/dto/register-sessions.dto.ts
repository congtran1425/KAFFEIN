import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsUUID,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class OpenRegisterSessionDto {
  @ApiPropertyOptional({
    description: 'Phiên đã bàn giao, dùng tiền và bảng kê từ phiên này',
  })
  @IsOptional()
  @IsUUID()
  handoverFromSessionId?: string;
  @ApiPropertyOptional({
    description: 'UUID của phiên tiền mặt nếu POS sinh offline',
  })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({
    description:
      'ID nhân viên mở ca tiền mặt (tùy chọn nếu đã đăng nhập cashier session)',
    example: '1',
  })
  @IsString()
  @IsOptional()
  openedByUserId?: string;

  @ApiPropertyOptional({
    description:
      'Mã nhân viên (employeeCode) mở ca tiền mặt (dùng cho POS gửi offline)',
    example: '1001',
  })
  @IsString()
  @IsOptional()
  openedByCode?: string;

  @ApiProperty({
    description: 'Số tiền tiền lẻ ban đầu trong két (VND)',
    example: 1000000,
  })
  @IsNumber()
  openingCashVnd: number;

  @ApiPropertyOptional({ description: 'Thời điểm mở ca (UTC string)' })
  @IsString()
  @IsOptional()
  openedAt?: string;

  @ApiPropertyOptional({
    description: 'Bảng kê số tờ từng mệnh giá tiền lúc mở ca dạng JSON',
    example: { '500000': 4, '200000': 5 },
  })
  @IsOptional()
  openingDenominations?: Record<string, number>;
}

export class CloseRegisterSessionDto {
  @ApiPropertyOptional({
    enum: ['HANDOVER', 'END_OF_DAY'],
    default: 'END_OF_DAY',
  })
  @IsOptional()
  @IsIn(['HANDOVER', 'END_OF_DAY'])
  closingMode?: 'HANDOVER' | 'END_OF_DAY';

  @ApiPropertyOptional({
    description: 'Tiền nộp bù, tách khỏi thực đếm ban đầu',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  compensationCashVnd?: number;

  @ApiPropertyOptional({ description: 'Bảng kê tiền nộp bù' })
  @IsOptional()
  compensationDenominations?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  compensationNote?: string;
  @ApiPropertyOptional({
    description:
      'ID nhân viên chốt ca tiền mặt (tùy chọn nếu đã đăng nhập cashier session)',
    example: '1',
  })
  @IsString()
  @IsOptional()
  closedByUserId?: string;

  @ApiPropertyOptional({
    description:
      'Mã nhân viên (employeeCode) chốt ca tiền mặt (dùng cho POS gửi offline)',
    example: '1001',
  })
  @IsString()
  @IsOptional()
  closedByCode?: string;

  @ApiProperty({
    description: 'Số tiền mặt thực tế kiểm đếm được trong két (VND)',
    example: 2500000,
  })
  @IsNumber()
  actualCashVnd: number;

  @ApiPropertyOptional({ description: 'Thời điểm đóng ca (UTC string)' })
  @IsString()
  @IsOptional()
  closedAt?: string;

  @ApiPropertyOptional({
    description: 'Bảng kê số tờ từng mệnh giá tiền lúc đóng ca dạng JSON',
    example: { '500000': 5, '200000': 5, '100000': 5 },
  })
  @IsOptional()
  closingDenominations?: Record<string, number>;
}

export class RegisterSessionResponseDto {
  compensationCashVnd?: string | null;
  compensationDenominations?: Record<string, number> | null;
  compensationNote?: string | null;
  closingMode?: string | null;
  handoverFromSessionId?: string | null;
  @ApiProperty({ description: 'UUID của phiên tiền mặt' })
  id: string;

  @ApiProperty({ description: 'ID thiết bị POS' })
  deviceId: string;

  @ApiProperty({ description: 'ID chi nhánh' })
  storeId: string;

  @ApiProperty({ description: 'ID nhân viên mở ca' })
  openedByUserId: string;

  @ApiPropertyOptional({ description: 'ID nhân viên đóng ca' })
  closedByUserId?: string;

  @ApiProperty({ description: 'Tiền đầu ca (VND)' })
  openingCashVnd: string;

  @ApiPropertyOptional({
    description: 'Tiền mặt kỳ vọng theo hệ thống ghi nhận (VND)',
  })
  expectedCashVnd?: string;

  @ApiPropertyOptional({ description: 'Tiền mặt thực tế nhân viên đếm (VND)' })
  actualCashVnd?: string;

  @ApiPropertyOptional({
    description: 'Chênh lệch thừa/thiếu (+ là thừa, - là thiếu)',
  })
  varianceVnd?: string;

  @ApiPropertyOptional({ description: 'Bảng kê mệnh giá tiền lúc mở ca' })
  openingDenominations?: Record<string, number> | null;

  @ApiPropertyOptional({ description: 'Bảng kê mệnh giá tiền lúc đóng ca' })
  closingDenominations?: Record<string, number> | null;

  @ApiProperty({ description: 'Trạng thái phiên (OPEN, CLOSED)' })
  status: string;

  @ApiProperty({ description: 'Thời điểm mở ca' })
  openedAt: string;

  @ApiPropertyOptional({ description: 'Thời điểm đóng ca' })
  closedAt?: string;
}

export class QueryRegisterSessionsDto {
  @ApiPropertyOptional({ enum: ['BALANCED', 'SURPLUS', 'SHORTAGE'] })
  @IsOptional()
  @IsIn(['BALANCED', 'SURPLUS', 'SHORTAGE'])
  variance?: 'BALANCED' | 'SURPLUS' | 'SHORTAGE';
  @ApiPropertyOptional({ description: 'ID chi nhánh' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({
    enum: ['OPEN', 'CLOSED'],
    description: 'Trạng thái phiên',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class RegisterSessionSummaryItemDto {
  compensationCashVnd!: string | null;
  compensationDenominations!: Record<string, number> | null;
  compensationNote!: string | null;
  closingMode!: string | null;
  handoverFromSessionId!: string | null;
  id!: string;
  storeId!: string;
  storeName!: string;
  deviceId!: string;
  openedByUserId!: string;
  openedByName!: string;
  closedByUserId!: string | null;
  closedByName!: string | null;
  openingCashVnd!: string;
  expectedCashVnd!: string | null;
  actualCashVnd!: string | null;
  varianceVnd!: string | null;
  openingDenominations!: Record<string, number> | null;
  closingDenominations!: Record<string, number> | null;
  status!: string;
  openedAt!: string;
  closedAt!: string | null;
}

export class PaginatedRegisterSessionsResponseDto {
  summary!: {
    openCount: number;
    openingCashVnd: string;
    surplusCount: number;
    surplusCashVnd: string;
    shortageCount: number;
    shortageCashVnd: string;
    compensationCashVnd: string;
  };
  items!: RegisterSessionSummaryItemDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}
