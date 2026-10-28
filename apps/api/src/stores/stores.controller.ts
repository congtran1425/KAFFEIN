import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import { PrismaService } from '../database/prisma.service';

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo chi nhánh mới trong chuỗi KAFFEIN (chỉ Owner)',
    description:
      'Tạo chi nhánh mới, tự động khởi tạo tồn kho nguyên liệu ban đầu và ghi nhận audit log.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Web management JWT token dạng Bearer <token>',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Chi nhánh được tạo thành công' })
  async createStore(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateStoreDto,
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
    return this.storesService.createStore(dto, actorUser.id);
  }

  @Get(':id/devices')
  @ApiOperation({
    summary: 'Lấy lịch sử thiết bị POS của chi nhánh (Owner / Manager)',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Bearer <token>',
    required: true,
  })
  async getStoreDevices(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') storeId: string,
  ) {
    WebPrincipalUtil.requireOwnerOrManager(authHeader, BigInt(storeId));
    return this.storesService.getStoreDevices(storeId);
  }
}
