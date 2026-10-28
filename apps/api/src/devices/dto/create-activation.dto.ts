import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateActivationDto {
  @ApiProperty({
    description: 'ID chi nhánh dạng chuỗi số thập phân',
    example: '1',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[1-9]\d*$/)
  storeId: string;

  @ApiPropertyOptional({
    description: 'Thời hạn kích hoạt tính bằng giờ (mặc định 24 giờ)',
    example: 24,
    default: 24,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number = 24;

  @ApiPropertyOptional({
    description: 'Cho phép cấp lại mã thay thế nếu chi nhánh đã có POS ACTIVE',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  reissue?: boolean = false;
}
