import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import { AttendanceService } from './attendance.service';
import {
  AttendanceCommandDto,
  AttendanceResponseDto,
} from './dto/attendance-command.dto';
import {
  AdjustAttendanceDto,
  AttendanceRecordItemDto,
  AttendanceSummaryResponseDto,
  ManualAttendanceDto,
  PaginatedAttendanceResponseDto,
  QueryAttendanceDto,
} from './dto/attendance-admin.dto';

@ApiTags('attendance')
@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post(['attendance:check-in', 'attendance/check-in'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nhân viên điểm danh vào ca (Check-in)',
    description:
      'Xác thực thiết bị POS và mã PIN nhân viên. Nếu phát hiện ca cũ chưa đóng quá 14h, tự động đóng ca cũ và mở ca mới.',
  })
  @ApiResponse({
    status: 200,
    description: 'Check-in thành công',
    type: AttendanceResponseDto,
  })
  async checkIn(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: AttendanceCommandDto,
  ): Promise<AttendanceResponseDto> {
    return this.attendanceService.checkIn(authHeader, dto);
  }

  @Post(['attendance:check-out', 'attendance/check-out'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nhân viên điểm danh ra ca (Check-out)',
    description:
      'Xác thực thiết bị POS và mã PIN nhân viên, tìm và đóng ca làm việc đang mở.',
  })
  @ApiResponse({
    status: 200,
    description: 'Check-out thành công',
    type: AttendanceResponseDto,
  })
  async checkOut(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: AttendanceCommandDto,
  ): Promise<AttendanceResponseDto> {
    return this.attendanceService.checkOut(authHeader, dto);
  }

  // ─── Web Admin Endpoints ──────────────────────────────────────────────────

  @Get('attendance')
  @ApiOperation({
    summary: 'Danh sách lượt chấm công (Web Admin)',
    description:
      'Lấy danh sách chấm công có phân trang, lọc theo ngày, chi nhánh, làm hỗ trợ hoặc quên check-out.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách lượt chấm công',
    type: PaginatedAttendanceResponseDto,
  })
  async listAttendance(
    @Headers('authorization') authHeader: string | undefined,
    @Query() query: QueryAttendanceDto,
  ): Promise<PaginatedAttendanceResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.attendanceService.getAttendanceRecords(principal, query);
  }

  @Get('attendance/summary')
  @ApiOperation({
    summary: 'Thống kê tổng quan chấm công trong ngày (Web Admin)',
    description:
      'Trả về tổng số nhân sự, số nhân viên đang trong ca làm và số ca bất thường cần kiểm tra.',
  })
  @ApiResponse({
    status: 200,
    description: 'Thống kê tổng quan chấm công',
    type: AttendanceSummaryResponseDto,
  })
  async getSummary(
    @Headers('authorization') authHeader: string | undefined,
    @Query('storeId') storeId?: string,
  ): Promise<AttendanceSummaryResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.attendanceService.getAttendanceSummary(principal, storeId);
  }

  @Patch('attendance/:id')
  @ApiOperation({
    summary: 'Điều chỉnh ca chấm công bất thường (Web Admin)',
    description:
      'Quản lý hoặc Owner điều chỉnh giờ check-in / check-out của ca làm việc kèm lý do, lưu vết audit log.',
  })
  @ApiResponse({
    status: 200,
    description: 'Điều chỉnh ca thành công',
    type: AttendanceRecordItemDto,
  })
  async adjustAttendance(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') attendanceId: string,
    @Body() dto: AdjustAttendanceDto,
  ): Promise<AttendanceRecordItemDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.attendanceService.adjustAttendance(
      principal,
      attendanceId,
      dto,
    );
  }

  @Post('attendance/manual')
  @ApiOperation({
    summary: 'Bổ sung ca chấm công thủ công (Web Admin)',
    description:
      'Tạo bản ghi chấm công bổ sung cho nhân viên quên check-in kèm lý do, lưu vết audit log.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tạo ca bổ sung thành công',
    type: AttendanceRecordItemDto,
  })
  async createManualAttendance(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: ManualAttendanceDto,
  ): Promise<AttendanceRecordItemDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.attendanceService.createManualAttendance(principal, dto);
  }
}
