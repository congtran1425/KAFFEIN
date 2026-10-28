import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleItemDto } from '../../sales/dto/create-sale.dto';

export class InitiateZaloPayDto {
  @ApiProperty({
    description: 'UUID ổn định của attempt/sale, dùng lại khi retry',
  })
  @IsUUID()
  saleId: string;

  @ApiProperty() @IsUUID() registerSessionId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedTotalVnd: number;

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}

export class CreateZaloPayOrderDto {
  @ApiProperty({
    description: 'ID đơn hàng (Sale ID)',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
  })
  @IsUUID()
  @IsNotEmpty()
  saleId: string;

  @ApiProperty({ description: 'Số tiền thanh toán (VND)', example: 45000 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountVnd: number;

  @ApiPropertyOptional({ description: 'Mô tả hiển thị trên app ZaloPay' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateZaloPayOrderResponseDto {
  @ApiPropertyOptional({ enum: ['ZALOPAY', 'MOMO'] })
  method?: 'ZALOPAY' | 'MOMO';
  @ApiProperty() saleId: string;
  @ApiProperty() expiresAt: string;
  @ApiProperty() amountVnd: string;
  @ApiProperty({
    description:
      'Mã định danh giao dịch Payment trên hệ thống để POS polling status',
    example: 'd9b01c34-8c83-4ee1-b75a-38b417e997f3',
  })
  paymentId: string;

  @ApiProperty({
    description: 'Mã đơn hàng phía merchant (app_trans_id)',
    example: '260926_1001_567890',
  })
  merchantOrderId: string;

  @ApiPropertyOptional({ description: 'Mã token giao dịch ZaloPay' })
  zpTransToken?: string;

  @ApiProperty({ description: 'URL mở app ZaloPay hoặc trang thanh toán' })
  orderUrl: string;

  @ApiProperty({
    description: 'Dữ liệu chuỗi mã QR động để POS hiển thị cho khách quét',
  })
  qrCode: string;
}

export class ZaloPayWebhookDto {
  @ApiProperty({
    description: 'Chuỗi JSON chứa dữ liệu chi tiết giao dịch từ ZaloPay',
  })
  @IsString()
  @IsNotEmpty()
  data: string;

  @ApiProperty({
    description: 'Chữ ký số HMAC-SHA256 để xác thực tính toàn vẹn',
  })
  @IsString()
  @IsNotEmpty()
  mac: string;

  @ApiPropertyOptional({ description: 'Loại callback (thường là 1)' })
  @IsOptional()
  type?: number;
}
