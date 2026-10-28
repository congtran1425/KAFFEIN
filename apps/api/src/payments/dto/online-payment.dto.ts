import {
  Allow,
  IsIn,
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InitiateZaloPayDto } from './zalopay.dto';
import type { OnlinePaymentMethod } from '../online-payment-provider';

export class InitiateOnlinePaymentDto extends InitiateZaloPayDto {
  @ApiProperty({ enum: ['ZALOPAY', 'MOMO'] })
  @IsIn(['ZALOPAY', 'MOMO'])
  provider: OnlinePaymentMethod;
}
export class MomoIpnDto {
  @IsString() @IsNotEmpty() partnerCode: string;
  @IsString() @IsNotEmpty() orderId: string;
  @IsString() @IsNotEmpty() requestId: string;
  @Allow() amount: number | string;
  @Allow() transId: number | string;
  @IsInt() resultCode: number;
  @IsInt() @Min(1) responseTime: number;
  @IsString() orderInfo: string;
  @IsString() orderType: string;
  @IsString() message: string;
  @IsString() payType: string;
  @IsString() extraData: string;
  @IsString() signature: string;
  @Allow() paymentOption?: string;
  @IsInt() @Min(0) @IsOptional() userFee?: number;
  @Allow() promotionInfo?: unknown;
  @Allow() partnerUserId?: string;
  @Allow() storeId?: string;
}
