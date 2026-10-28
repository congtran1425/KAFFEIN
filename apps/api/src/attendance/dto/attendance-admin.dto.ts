import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryAttendanceDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID chi nhánh' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (ISO)' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO)' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc mã nhân viên' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc lượt làm hỗ trợ' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isSupport?: boolean;

  @ApiPropertyOptional({ description: 'Lọc lượt quên check-out' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isMissedCheckout?: boolean;

  @ApiPropertyOptional({ description: 'Số trang', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng mục trên mỗi trang',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;
}

export class AttendanceRecordItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  employeeCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  homeStoreId!: string;

  @ApiProperty()
  homeStoreName!: string;

  @ApiProperty()
  storeId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  checkInAt!: string;

  @ApiPropertyOptional()
  checkOutAt!: string | null;

  @ApiProperty()
  isSupport!: boolean;

  @ApiProperty()
  isMissedCheckout!: boolean;

  @ApiProperty()
  isManualEntry!: boolean;

  @ApiProperty({ description: 'Ghi nhận phân loại hiển thị' })
  note!: string;
}

export class PaginatedAttendanceResponseDto {
  @ApiProperty({ type: [AttendanceRecordItemDto] })
  items!: AttendanceRecordItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  totalPages!: number;
}

export class AttendanceSummaryResponseDto {
  @ApiProperty({ description: 'Tổng nhân sự trong phạm vi' })
  totalEmployees!: number;

  @ApiProperty({ description: 'Số nhân viên đang trong ca làm việc' })
  activeCount!: number;

  @ApiProperty({
    description: 'Số lượt cần kiểm tra (quên check-out, ca bất thường)',
  })
  abnormalCount!: number;
}

export class AdjustAttendanceDto {
  @ApiPropertyOptional({
    description: 'Thời gian check-in điều chỉnh (ISO string)',
  })
  @IsOptional()
  @IsString()
  checkInAt?: string;

  @ApiPropertyOptional({
    description: 'Thời gian check-out điều chỉnh (ISO string)',
  })
  @IsOptional()
  @IsString()
  checkOutAt?: string;

  @ApiProperty({ description: 'Lý do điều chỉnh (bắt buộc để lưu audit log)' })
  @IsNotEmpty({ message: 'Lý do điều chỉnh không được để trống' })
  @IsString()
  reason!: string;
}

export class ManualAttendanceDto {
  @ApiProperty({ description: 'ID nhân viên' })
  @IsNotEmpty({ message: 'userId không được để trống' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: 'ID chi nhánh làm việc' })
  @IsNotEmpty({ message: 'storeId không được để trống' })
  @IsString()
  storeId!: string;

  @ApiProperty({ description: 'Thời gian check-in (ISO string)' })
  @IsNotEmpty({ message: 'checkInAt không được để trống' })
  @IsString()
  checkInAt!: string;

  @ApiProperty({ description: 'Thời gian check-out (ISO string)' })
  @IsNotEmpty({ message: 'checkOutAt không được để trống' })
  @IsString()
  checkOutAt!: string;

  @ApiProperty({ description: 'Lý do bổ sung ca' })
  @IsNotEmpty({ message: 'Lý do bổ sung ca không được để trống' })
  @IsString()
  reason!: string;
}
