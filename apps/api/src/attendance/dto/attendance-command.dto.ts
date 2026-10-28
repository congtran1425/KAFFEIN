import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AttendanceCommandDto {
  @ApiProperty({
    description: 'Mã nhân viên gồm đúng 7 chữ số (bắt đầu từ 1000001)',
    example: '1000001',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7}$/, {
    message: 'Mã nhân viên phải gồm đúng 7 chữ số.',
  })
  employeeCode: string;

  @ApiProperty({
    description: 'Mã PIN bảo mật của nhân viên (đúng 4 số)',
    example: '1234',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, {
    message: 'Mã PIN phải gồm đúng 4 chữ số.',
  })
  pin: string;
}

export class AttendanceResponseDto {
  @ApiProperty({ description: 'UUID của bản ghi điểm danh' })
  attendanceId: string;

  @ApiProperty({ description: 'Hành động', enum: ['CHECK_IN', 'CHECK_OUT'] })
  action: 'CHECK_IN' | 'CHECK_OUT';

  @ApiProperty({ description: 'Tên nhân viên' })
  employeeName: string;

  @ApiProperty({ description: 'Mã nhân viên 7 số' })
  employeeCode: string;

  @ApiProperty({ description: 'ID chi nhánh máy POS' })
  storeId: string;

  @ApiProperty({ description: 'Tên chi nhánh máy POS' })
  storeName: string;

  @ApiProperty({
    description: 'Đánh dấu nhân viên đang đi làm hỗ trợ tại chi nhánh khác',
  })
  isSupport: boolean;

  @ApiProperty({ description: 'Thời gian chính thức theo UTC' })
  timestamp: string;

  @ApiProperty({
    description:
      'Đánh dấu ca trước đó bị quên checkout và đã được tự động đóng',
  })
  wasPreviousMissed: boolean;
}
