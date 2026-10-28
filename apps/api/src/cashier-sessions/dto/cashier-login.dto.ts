import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CashierLoginDto {
  @ApiProperty({
    description: 'Mã nhân viên gồm đúng 7 chữ số',
    example: '1000001',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7}$/, {
    message: 'Mã nhân viên phải gồm đúng 7 chữ số.',
  })
  employeeCode: string;

  @ApiProperty({
    description: 'Mã PIN bảo mật gồm đúng 4 chữ số',
    example: '1234',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, {
    message: 'Mã PIN phải gồm đúng 4 chữ số.',
  })
  pin: string;
}

export class CashierLoginResponseDto {
  @ApiProperty({ description: 'Mã phiên thu ngân (Session ID)' })
  sessionId: string;

  @ApiProperty({ description: 'ID nhân viên' })
  employeeId: string;

  @ApiProperty({ description: 'Mã nhân viên' })
  employeeCode: string;

  @ApiProperty({ description: 'Tên thu ngân' })
  employeeName: string;

  @ApiProperty({ description: 'ID chi nhánh máy POS' })
  storeId: string;

  @ApiProperty({ description: 'Tên chi nhánh máy POS' })
  storeName: string;

  @ApiProperty({ description: 'Thời điểm bắt đầu phiên làm việc (UTC)' })
  loggedInAt: string;
}
