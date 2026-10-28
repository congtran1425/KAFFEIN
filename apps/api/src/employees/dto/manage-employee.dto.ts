import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ enum: ['EMPLOYEE', 'STORE_MANAGER'] })
  @IsIn(['EMPLOYEE', 'STORE_MANAGER'])
  role!: 'EMPLOYEE' | 'STORE_MANAGER';

  @ApiProperty({ example: '1' })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  homeStoreId!: string;

  @ApiProperty({ description: 'Four-digit POS PIN, never returned by the API' })
  @IsString()
  @Matches(/^\d{4}$/)
  pin!: string;

  @ApiPropertyOptional({ description: 'Required only for a store manager' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Required only for a store manager' })
  @IsOptional()
  @IsString()
  @MinLength(12)
  webPassword?: string;
}

export class ResetEmployeePinDto {
  @ApiProperty({ description: 'New four-digit POS PIN' })
  @IsString()
  @Matches(/^\d{4}$/)
  pin!: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'TERMINATED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'TERMINATED'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
}
