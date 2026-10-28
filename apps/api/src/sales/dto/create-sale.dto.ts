import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSaleItemToppingDto {
  @ApiPropertyOptional({
    description: 'ID UUID của topping item (nếu POS sinh offline)',
  })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ description: 'ID của topping', example: '1' })
  @IsString()
  @IsNotEmpty()
  toppingId: string;

  @ApiPropertyOptional({
    description: 'Số lượng topping trên mỗi đơn vị món (mặc định 1)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantityPerItem?: number;
}

export class CreateSaleItemDto {
  @ApiPropertyOptional({
    description: 'ID UUID của dòng món (nếu POS sinh offline)',
  })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ description: 'ID sản phẩm', example: '1' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'ID biến thể kích cỡ (Size M, L...)',
    example: '1',
  })
  @IsString()
  @IsNotEmpty()
  productVariantId: string;

  @ApiProperty({ description: 'Số lượng món', example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Ghi chú cho món (ít đá, ít ngọt...)' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    description: 'Danh sách topping kèm theo',
    type: [CreateSaleItemToppingDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemToppingDto)
  @IsOptional()
  toppings?: CreateSaleItemToppingDto[];
}

export class CreateSalePaymentDto {
  @ApiProperty({
    description: 'Phương thức thanh toán',
    enum: ['CASH', 'ZALOPAY', 'MOMO'],
    example: 'CASH',
  })
  @IsEnum(['CASH', 'ZALOPAY', 'MOMO'])
  method: 'CASH' | 'ZALOPAY' | 'MOMO';

  @ApiProperty({ description: 'Số tiền thanh toán (VND)', example: 45000 })
  @IsNotEmpty()
  amountVnd: number | string;

  @ApiPropertyOptional({
    description: 'Mã đơn hàng phía cổng thanh toán (nếu ZaloPay)',
  })
  @IsString()
  @IsOptional()
  merchantOrderId?: string;
}

export class CreateSaleDto {
  @ApiPropertyOptional({ description: 'UUID đơn hàng (nếu POS sinh offline)' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'Mã hiển thị đơn hàng (Receipt number)' })
  @IsString()
  @IsOptional()
  saleNumber?: string;

  @ApiPropertyOptional({
    description:
      'ID nhân viên thu ngân thực hiện đơn (tùy chọn, ưu tiên lấy từ cashier session)',
    example: '1',
  })
  @IsString()
  @IsOptional()
  cashierUserId?: string;

  @ApiPropertyOptional({
    description: 'ID phiên tiền mặt (Register Session) nếu có',
  })
  @IsString()
  @IsOptional()
  registerSessionId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú chung cho đơn' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty({
    description: 'Danh sách món trong đơn',
    type: [CreateSaleItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiProperty({
    description: 'Thông tin thanh toán',
    type: CreateSalePaymentDto,
  })
  @ValidateNested()
  @Type(() => CreateSalePaymentDto)
  payment: CreateSalePaymentDto;

  @ApiPropertyOptional({
    description: 'Thời điểm tạo đơn tại POS (UTC string)',
  })
  @IsString()
  @IsOptional()
  createdAt?: string;
}
