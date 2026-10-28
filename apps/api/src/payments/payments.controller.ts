import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import {
  CreateZaloPayOrderDto,
  CreateZaloPayOrderResponseDto,
  ZaloPayWebhookDto,
  InitiateZaloPayDto,
} from './dto/zalopay.dto';
import { PaymentsService } from './payments.service';
import { InitiateOnlinePaymentDto, MomoIpnDto } from './dto/online-payment.dto';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('payments/online/capabilities')
  async onlineCapabilities(
    @Headers('authorization') authHeader: string | undefined,
  ) {
    await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.onlineCapabilities();
  }

  @Post('payments/online/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateOnline(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: InitiateOnlinePaymentDto,
  ) {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.initiate(
      device.storeId,
      device.id,
      dto,
      dto.provider,
    );
  }

  @Post('webhooks/momo')
  @HttpCode(HttpStatus.NO_CONTENT)
  async momoIpn(@Body() dto: MomoIpnDto) {
    await this.paymentsService.handleMomoIpn({ ...dto });
  }

  @Get('payments/online/cancelled-receipts')
  @ApiOperation({
    summary: 'Tiền nhận sau khi hủy nội bộ, cần đối soát; không tính doanh thu',
  })
  async cancelledReceipts(
    @Headers('authorization') authHeader: string | undefined,
  ) {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    if (principal.role === 'STORE_MANAGER' && !principal.homeStoreId)
      throw new UnauthorizedException('Cần chi nhánh quản lý hợp lệ.');
    return this.paymentsService.cancelledReceipts(
      principal.role === 'OWNER' ? undefined : BigInt(principal.homeStoreId!),
    );
  }

  @Get('payments/momo/return')
  @Header('Content-Type', 'text/html; charset=utf-8')
  momoReturn(): string {
    return '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoMo</title><body style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px;color:#173d35"><h1>Đã quay lại KAFFEIN POS</h1><p>Ứng dụng POS đang tự kiểm tra trạng thái giao dịch với máy chủ. Trang này không xác nhận thanh toán.</p><p>Bạn có thể quay lại màn hình POS.</p></body></html>';
  }

  @Get('payments/zalopay/capabilities')
  async capabilities(@Headers('authorization') authHeader: string | undefined) {
    await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.capabilities();
  }

  @Post('payments/zalopay/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Chốt giỏ, tạo một pending sale/payment idempotent và QR Sandbox 5 phút',
  })
  async initiate(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: InitiateZaloPayDto,
  ) {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.initiate(device.storeId, device.id, dto);
  }

  @Get(['payments/zalopay/pending', 'payments/online/pending'])
  @ApiOperation({ summary: 'Khôi phục payment chờ của máy POS đã kích hoạt' })
  async pending(@Headers('authorization') authHeader: string | undefined) {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.getPendingForDevice(device.storeId, device.id);
  }

  @Get([
    'payments/zalopay/attempts/:saleId',
    'payments/online/attempts/:saleId',
  ])
  @ApiOperation({
    summary: 'Khôi phục cùng attempt khi POS mất response hoặc khởi động lại',
  })
  async attempt(
    @Headers('authorization') authHeader: string | undefined,
    @Param('saleId', new ParseUUIDPipe()) saleId: string,
  ) {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.getAttempt(device.storeId, device.id, saleId);
  }

  @Post([
    'payments/zalopay/attempts/:saleId/check',
    'payments/online/attempts/:saleId/check',
  ])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra ZaloPay ngay, bỏ cache polling 60 giây',
    description:
      'Xác thực đúng device/store. Truy vấn cùng merchant order, chờ kết quả và settlement; không tạo đơn mới. Các kiểm tra thủ công đồng thời cùng process được gộp. Lỗi query trả 503, không suy ra chưa thanh toán. MoMo tiếp tục dùng GET attempt theo lease hiện có.',
  })
  async checkAttempt(
    @Headers('authorization') authHeader: string | undefined,
    @Param('saleId', new ParseUUIDPipe()) saleId: string,
  ) {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.checkAttempt(device.storeId, device.id, saleId);
  }

  @Post([
    'payments/zalopay/attempts/:saleId/cancel',
    'payments/online/attempts/:saleId/cancel',
  ])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hủy QR; MoMo ghi nhận CANCELLED tại server, ZaloPay xác nhận từ provider',
    description:
      'MoMo: CANCELLED là hủy nội bộ và mở khóa giỏ; QR cũ vẫn được đối soát, tiền về muộn được ghi riêng, không hoàn tất sale đã hủy. ZaloPay: mở khóa khi provider xác nhận FINAL_UNPAID. PAID/đã xác nhận nhận tiền trả 409. Hết countdown không tự hủy.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Trạng thái authoritative: CANCELLED, PAID, WAITING, RECONCILING hoặc FINAL_UNPAID. Chỉ CANCELLED/FINAL_UNPAID mở khóa sau yêu cầu hủy; HTTP 200 tự nó không chứng minh đã hủy.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Đơn đã được trả tiền/xác nhận tiền; không hủy hoặc hoàn tiền. Đọc GET attempts/:saleId để đối soát.',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  async cancelAttempt(
    @Headers('authorization') authHeader: string | undefined,
    @Param('saleId', new ParseUUIDPipe()) saleId: string,
  ) {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.cancelAttempt(
      device.storeId,
      device.id,
      saleId,
    );
  }

  @Post('payments/zalopay/create-order')
  @ApiOperation({
    summary: 'Khởi tạo đơn thanh toán ZaloPay Sandbox và lấy mã QR',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Device credential dạng Device <credential> của máy POS',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Mã QR và thông tin giao dịch ZaloPay',
    type: CreateZaloPayOrderResponseDto,
  })
  async createZaloPayOrder(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateZaloPayOrderDto,
  ): Promise<CreateZaloPayOrderResponseDto> {
    const device = await this.devicesService.authenticateDevice(authHeader);
    return this.paymentsService.createZaloPayOrder(
      device.storeId,
      dto,
      device.id,
    );
  }

  @Post('webhooks/zalopay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook nhận callback thanh toán thành công từ ZaloPay',
    description:
      'Xác thực chữ ký số HMAC-SHA256 với secret key2 từ ZaloPay và cập nhật trạng thái đơn hàng.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Kết quả phản hồi cho ZaloPay Gateway ({ return_code, return_message })',
  })
  async handleWebhook(@Body() dto: ZaloPayWebhookDto) {
    return this.paymentsService.handleWebhook(dto);
  }

  @Get('payments/:id/status')
  @ApiOperation({ summary: 'Tra cứu trạng thái giao dịch thanh toán' })
  @ApiHeader({
    name: 'authorization',
    description:
      'Device credential (Device <credential>) hoặc Web Manager/Owner token (Bearer <token>)',
    required: true,
  })
  async getPaymentStatus(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
  ) {
    if (authHeader && authHeader.startsWith('Device ')) {
      const device = await this.devicesService.authenticateDevice(authHeader);
      return this.paymentsService.getPaymentStatus(id, device.storeId);
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const principal = WebPrincipalUtil.parseToken(authHeader);
      if (principal.role === 'OWNER') {
        return this.paymentsService.getPaymentStatus(id);
      }
      if (principal.role !== 'STORE_MANAGER' || !principal.homeStoreId) {
        throw new UnauthorizedException(
          'Cần quyền quản lý và chi nhánh hợp lệ.',
        );
      }
      return this.paymentsService.getPaymentStatus(
        id,
        BigInt(principal.homeStoreId),
      );
    }

    throw new UnauthorizedException(
      'Cần xác thực thiết bị (Device <credential>) hoặc tài khoản quản trị (Bearer <token>) để tra cứu thanh toán.',
    );
  }
}
