import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EnrollDeviceDto {
  @ApiProperty({
    description: 'Mã kích hoạt thiết bị một lần định dạng <lookup>.<secret>',
    example: 'ABCD1234.9f8e7d6c5b4a3210fedcba9876543210',
  })
  @IsString()
  @IsNotEmpty()
  activationCode: string;

  @ApiProperty({
    description: 'Tên hiển thị của thiết bị',
    example: 'POS Quầy 01',
  })
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @ApiPropertyOptional({
    description: 'Phiên bản ứng dụng POS Android',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class EnrollDeviceResponseDto {
  @ApiProperty({ description: 'UUID định danh duy nhất của thiết bị' })
  deviceId: string;

  @ApiProperty({ description: 'ID chi nhánh mà thiết bị được gán' })
  storeId: string;

  @ApiProperty({ description: 'Tên chi nhánh' })
  storeName: string;

  @ApiProperty({
    description: 'Credential bí mật của thiết bị dùng cho các API sau này',
  })
  deviceCredential: string;
}
