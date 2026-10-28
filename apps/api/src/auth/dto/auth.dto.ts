import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebLoginDto {
  @ApiProperty({ example: 'owner@coffeepos.vn' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  password!: string;
}

export class WebLoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ['OWNER', 'STORE_MANAGER'] })
  role!: 'OWNER' | 'STORE_MANAGER';

  @ApiProperty({ nullable: true })
  homeStoreId!: string | null;

  @ApiProperty()
  fullName!: string;

  /** Seconds until expiry (8 hours) */
  @ApiProperty()
  expiresIn!: number;
}

export class ActiveDeviceSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ nullable: true })
  appVersion!: string | null;

  @ApiProperty({ nullable: true })
  lastHeartbeatAt!: string | null;

  @ApiProperty()
  isOnline!: boolean;

  @ApiProperty()
  hasPendingOutbox!: boolean;
}

export class StoreResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty({ nullable: true })
  posDeviceId!: string | null;

  @ApiProperty({ nullable: true })
  posLastHeartbeat!: string | null;

  @ApiProperty()
  posOnline!: boolean;

  @ApiProperty()
  posHasPendingOutbox!: boolean;

  @ApiProperty({ type: ActiveDeviceSummaryDto, nullable: true })
  activeDevice!: ActiveDeviceSummaryDto | null;

  @ApiProperty({
    description: 'Số lượng thiết bị POS đã thu hồi trong lịch sử',
  })
  revokedDeviceCount!: number;
}

export class MeResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: ['OWNER', 'STORE_MANAGER'] })
  role!: 'OWNER' | 'STORE_MANAGER';

  @ApiProperty({ nullable: true })
  homeStoreId!: string | null;
}
