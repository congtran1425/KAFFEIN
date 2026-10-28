import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';

export class SyncOperationItemDto {
  @ApiProperty({
    description: 'ID định danh duy nhất của tác vụ (UUID)',
    example: '018f0000-0000-7000-8000-000000000001',
  })
  @IsString()
  @IsNotEmpty()
  operationId: string;

  @ApiPropertyOptional({
    description: 'Loại tác vụ nghiệp vụ cần đồng bộ',
    enum: [
      'CASH_SALE_COMPLETED',
      'REGISTER_SESSION_OPENED',
      'REGISTER_SESSION_CLOSED',
      'STOCK_ADJUSTED',
    ],
    example: 'CASH_SALE_COMPLETED',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Tên loại tác vụ theo định dạng Android OutboxOperationEntity',
    example: 'CASH_SALE_COMPLETED',
  })
  @IsString()
  @IsOptional()
  operationType?: string;

  @ApiPropertyOptional({
    description: 'Thời điểm tác vụ phát sinh tại POS (UTC string)',
  })
  @IsString()
  @IsOptional()
  occurredAt?: string;

  @ApiPropertyOptional({
    description: 'Thời điểm tác vụ phát sinh theo chuẩn Android POS',
  })
  @IsOptional()
  createdAt?: string | number;

  @ApiProperty({ description: 'Payload chi tiết của tác vụ', type: Object })
  @IsObject()
  payload: Record<string, any>;
}

export class SyncPushRequestDto {
  @ApiProperty({
    description: 'Danh sách các tác vụ gửi từ Outbox của máy POS',
    type: [SyncOperationItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationItemDto)
  operations: SyncOperationItemDto[];
}

export class SyncPushResultItemDto {
  @ApiProperty({ description: 'ID định danh tác vụ' })
  operationId: string;

  @ApiProperty({
    description: 'Trạng thái xử lý (COMPLETED, ALREADY_PROCESSED, REJECTED)',
  })
  status: 'COMPLETED' | 'ALREADY_PROCESSED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Kết quả xử lý nghiệp vụ trả về' })
  result?: any;

  @ApiPropertyOptional({ description: 'Chi tiết thông báo lỗi nếu thất bại' })
  error?: string;
}

export class SyncPushResponseDto {
  @ApiProperty({
    description: 'Danh sách tác vụ đã xử lý thành công',
    type: [SyncPushResultItemDto],
  })
  processed: SyncPushResultItemDto[];

  @ApiProperty({
    description: 'Danh sách tác vụ thất bại',
    type: [SyncPushResultItemDto],
  })
  errors: SyncPushResultItemDto[];
}

export class SyncPullQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor hiện tại của thiết bị (mặc định 0)',
    default: '0',
  })
  @IsString()
  @Matches(/^\d{1,19}$/, {
    message: 'cursor must be a non-negative decimal integer',
  })
  @IsOptional()
  cursor?: string = '0';

  @ApiPropertyOptional({
    description:
      'Số delta tối đa trong một trang (snapshot cursor=0 luôn trả đầy đủ)',
    default: 100,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 100;
}

export class SyncChangeItemDto {
  @ApiProperty({ description: 'Mã số con trỏ thứ tự thay đổi (cursor)' })
  cursor: string;

  @ApiProperty({
    description:
      'Loại thực thể (products, categories, recipes, employees, store)',
  })
  entityType: string;

  @ApiProperty({ description: 'ID của thực thể' })
  entityId: string;

  @ApiProperty({ description: 'Loại thay đổi (UPSERT, DELETE)' })
  changeType: string;

  @ApiProperty({ description: 'Dữ liệu thực thể được đồng bộ' })
  payload: any;

  @ApiProperty({ description: 'Thời điểm thay đổi phát sinh' })
  changedAt: string;
}

export class SyncPullResponseDto {
  @ApiProperty({
    description: 'Danh sách các thay đổi cần cập nhật vào Room DB',
    type: [SyncChangeItemDto],
  })
  changes: SyncChangeItemDto[];

  @ApiProperty({ description: 'Cursor tiếp theo để máy POS lưu checkpoint' })
  nextCursor: string;

  @ApiProperty({ description: 'Còn dữ liệu phía sau để kéo tiếp không' })
  hasMore: boolean;

  @ApiProperty({
    description: 'Thời gian hiện tại của server (UTC ISO string)',
  })
  serverTime: string;
}
