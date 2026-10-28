import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevicesService } from '../devices/devices.service';
import {
  SyncPullQueryDto,
  SyncPullResponseDto,
  SyncPushRequestDto,
  SyncPushResponseDto,
} from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('Sync Engine')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly devicesService: DevicesService,
  ) {}

  @Post(['push', 'operations'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đồng bộ danh sách thao tác từ Outbox của máy POS lên Server',
    description:
      'Nhận batch các operations phát sinh offline (đơn tiền mặt, mở/đóng ca két...). Hệ thống tự động chống lặp (Idempotent) bằng operationId và hash payload, đảm bảo không trừ kho hoặc ghi nhận đơn 2 lần.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Kết quả xử lý batch outbox',
    type: SyncPushResponseDto,
  })
  async push(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: SyncPushRequestDto,
  ): Promise<SyncPushResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.syncService.pushOperations(device.storeId, device.id, dto);
  }

  @Get(['pull', 'changes'])
  @ApiOperation({
    summary: 'Kéo thay đổi từ Server về máy POS (Cursor-based)',
    description:
      'Cho phép máy POS cập nhật danh mục món, giá bán, công thức và danh sách nhân sự tại chi nhánh. Hỗ trợ bootstrap (cursor=0) và đồng bộ delta.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách thay đổi cùng con trỏ nextCursor',
    type: SyncPullResponseDto,
  })
  async pull(
    @Headers('authorization') authHeader: string | undefined,
    @Query() query: SyncPullQueryDto,
  ): Promise<SyncPullResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.syncService.pullChanges(device.storeId, device.id, query);
  }
}
