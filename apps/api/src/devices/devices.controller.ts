import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { CreateActivationDto } from './dto/create-activation.dto';
import {
  EnrollDeviceDto,
  EnrollDeviceResponseDto,
} from './dto/enroll-device.dto';
import { PrismaService } from '../database/prisma.service';
import { WebPrincipalUtil } from '../common/security/web-principal.util';

@ApiTags('devices')
@Controller()
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('device-activations')
  @ApiOperation({
    summary: 'Tạo mã kích hoạt thiết bị một lần (chỉ Owner)',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Mã kích hoạt được tạo thành công' })
  async createActivation(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateActivationDto,
  ) {
    const principal = WebPrincipalUtil.requireOwner(authHeader);

    const actorUser = await this.prisma.user.findUnique({
      where: { id: BigInt(principal.userId) },
    });

    if (!actorUser || actorUser.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Tài khoản người dùng không tồn tại hoặc đã bị khóa.',
      );
    }

    return this.devicesService.createActivationCode(dto, actorUser.id);
  }

  @Post('devices/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thu hồi khẩn cấp thiết bị POS (chỉ Owner)',
    description:
      'Ngay lập tức chuyển trạng thái máy POS thành REVOKED và hủy phiên thu ngân đang mở.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Thiết bị đã bị thu hồi thành công',
  })
  async revokeDevice(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') deviceId: string,
  ) {
    const principal = WebPrincipalUtil.requireOwner(authHeader);
    const actorUser = await this.prisma.user.findUnique({
      where: { id: BigInt(principal.userId) },
    });
    if (!actorUser || actorUser.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Tài khoản người dùng không tồn tại hoặc đã bị khóa.',
      );
    }
    return this.devicesService.revokeDevice(deviceId, actorUser.id);
  }

  @Post('device/enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Máy POS đổi mã kích hoạt lấy thiết bị và credential',
  })
  @ApiResponse({
    status: 200,
    description: 'Thiết bị được kích hoạt thành công',
    type: EnrollDeviceResponseDto,
  })
  async enrollDevice(
    @Body() dto: EnrollDeviceDto,
  ): Promise<EnrollDeviceResponseDto> {
    return this.devicesService.enrollDevice(dto);
  }

  @Post('device/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Báo cáo tín hiệu sống (heartbeat) định kỳ từ máy POS',
  })
  @ApiResponse({ status: 200, description: 'Ghi nhận heartbeat thành công' })
  async heartbeat(
    @Headers('authorization') authHeader?: string,
    @Body()
    body?: {
      appVersion?: string;
      hasPendingOutbox?: boolean;
      outboxPendingCount?: number;
    },
  ) {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.devicesService.recordHeartbeat(device.id, body);
  }
}
