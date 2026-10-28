import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevicesService } from '../devices/devices.service';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import {
  CloseRegisterSessionDto,
  OpenRegisterSessionDto,
  PaginatedRegisterSessionsResponseDto,
  QueryRegisterSessionsDto,
  RegisterSessionResponseDto,
} from './dto/register-sessions.dto';
import { RegisterSessionsService } from './register-sessions.service';

@ApiTags('Register Sessions')
@Controller('register-sessions')
export class RegisterSessionsController {
  constructor(
    private readonly registerSessionsService: RegisterSessionsService,
    private readonly devicesService: DevicesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách lịch sử các phiên tiền mặt (Web Owner / Store Manager)',
    description:
      'Tra cứu các phiên mở/đóng ca tiền mặt, đối soát chênh lệch két (variance). Phân quyền: Owner xem toàn chuỗi, Store Manager chỉ xem chi nhánh nhà.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách phiên tiền mặt có phân trang',
    type: PaginatedRegisterSessionsResponseDto,
  })
  async getSessions(
    @Headers('authorization') authHeader: string | undefined,
    @Query() query: QueryRegisterSessionsDto,
  ): Promise<PaginatedRegisterSessionsResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);

    return this.registerSessionsService.getSessions({
      requestingRole: principal.role,
      requestingHomeStoreId: principal.homeStoreId
        ? BigInt(principal.homeStoreId)
        : undefined,
      targetStoreId: query.storeId ? BigInt(query.storeId) : undefined,
      status: query.status,
      variance: query.variance,
      page: query.page ? parseInt(query.page, 10) : 1,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 20,
    });
  }

  @Get('current')
  @ApiOperation({
    summary: 'Lấy thông tin phiên tiền mặt đang mở của thiết bị',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Thông tin phiên tiền mặt hiện tại (hoặc null nếu chưa mở ca)',
    type: RegisterSessionResponseDto,
  })
  async getCurrent(
    @Headers('authorization') authHeader: string | undefined,
  ): Promise<RegisterSessionResponseDto | null> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.registerSessionsService.getCurrentSession(device.id);
  }

  @Post(['open', ''])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Mở ca tiền mặt đầu ngày/đầu ca' })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Mở phiên tiền mặt thành công',
    type: RegisterSessionResponseDto,
  })
  async openSession(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: OpenRegisterSessionDto,
  ): Promise<RegisterSessionResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.registerSessionsService.openSession(
      device.storeId,
      device.id,
      dto,
    );
  }

  @Post([':id/close', 'close'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đóng ca tiền mặt, đối soát doanh thu và chênh lệch két',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Đóng ca và đối soát tiền mặt thành công',
    type: RegisterSessionResponseDto,
  })
  async closeSession(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') sessionId: string,
    @Body() dto: CloseRegisterSessionDto,
  ): Promise<RegisterSessionResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.registerSessionsService.closeSession(
      device.storeId,
      device.id,
      sessionId,
      dto,
    );
  }
}
