import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryEmployeesDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID chi nhánh' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc mã nhân viên' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo vai trò (OWNER, STORE_MANAGER, EMPLOYEE)',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái (ACTIVE, INACTIVE)',
  })
  @IsOptional()
  @IsString()
  status?: string;

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

export class EmployeeItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Mã nhân viên 7 chữ số (ví dụ: 1000001)' })
  employeeCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  homeStoreId!: string | null;

  @ApiPropertyOptional()
  homeStoreName!: string | null;

  @ApiPropertyOptional()
  homeStoreCode!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class PaginatedEmployeesResponseDto {
  @ApiProperty({ type: [EmployeeItemDto] })
  items!: EmployeeItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  totalPages!: number;
}

export class TransferEmployeeDto {
  @ApiProperty({ description: 'ID chi nhánh mới chuyển đến' })
  @IsNotEmpty({ message: 'toStoreId không được để trống' })
  @IsString()
  toStoreId!: string;

  @ApiPropertyOptional({ description: 'Lý do điều chuyển' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TransferHistoryItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  fromStoreId!: string;

  @ApiProperty()
  fromStoreName!: string;

  @ApiProperty()
  toStoreId!: string;

  @ApiProperty()
  toStoreName!: string;

  @ApiProperty()
  transferredByUserId!: string;

  @ApiProperty()
  transferredByName!: string;

  @ApiProperty()
  effectiveAt!: string;

  @ApiPropertyOptional()
  reason!: string | null;

  @ApiProperty()
  createdAt!: string;
}
