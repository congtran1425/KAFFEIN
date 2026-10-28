import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({
    description: 'Mã định danh chi nhánh (chữ cái, số, gạch ngang, không dấu)',
    example: '10003',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'Mã chi nhánh chỉ bao gồm chữ cái, số, dấu gạch dưới hoặc gạch ngang',
  })
  code: string;

  @ApiProperty({
    description: 'Tên hiển thị chi nhánh',
    example: 'Chi nhánh Quận 7 (Phú Mỹ Hưng)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Tên chi nhánh phải có ít nhất 3 ký tự' })
  name: string;

  @ApiProperty({
    description: 'Địa chỉ chi nhánh',
    example: '123 Nguyễn Văn Linh, P. Tân Phong, Quận 7, TP.HCM',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Địa chỉ chi nhánh phải có ít nhất 5 ký tự' })
  address: string;
}
