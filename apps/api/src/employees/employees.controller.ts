import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebPrincipalUtil } from '../common/security/web-principal.util';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  ResetEmployeePinDto,
  UpdateEmployeeDto,
} from './dto/manage-employee.dto';
import {
  EmployeeItemDto,
  PaginatedEmployeesResponseDto,
  QueryEmployeesDto,
  TransferEmployeeDto,
  TransferHistoryItemDto,
} from './dto/employees.dto';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @ApiOperation({ summary: 'Owner creates an employee or store manager' })
  @ApiResponse({ status: 201, type: EmployeeItemDto })
  async createEmployee(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateEmployeeDto,
  ): Promise<EmployeeItemDto> {
    const principal = WebPrincipalUtil.requireOwner(authHeader);
    return this.employeesService.createEmployee(principal, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Owner updates employee name or status; store transfer is separate',
  })
  @ApiResponse({ status: 200, type: EmployeeItemDto })
  async updateEmployee(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeItemDto> {
    const principal = WebPrincipalUtil.requireOwner(authHeader);
    return this.employeesService.updateEmployee(principal, employeeId, dto);
  }

  @Post(':id/reset-pin')
  @ApiOperation({
    summary: 'Owner resets an employee POS PIN and revokes cashier sessions',
  })
  async resetPin(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') employeeId: string,
    @Body() dto: ResetEmployeePinDto,
  ): Promise<{ employeeId: string; pinVersion: number }> {
    const principal = WebPrincipalUtil.requireOwner(authHeader);
    return this.employeesService.resetPin(principal, employeeId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách nhân viên (Web Admin)',
    description:
      'Lấy danh sách nhân viên có phân trang. Chủ chuỗi xem toàn chuỗi; Cửa hàng trưởng chỉ xem nhân viên chi nhánh nhà.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách nhân viên',
    type: PaginatedEmployeesResponseDto,
  })
  async listEmployees(
    @Headers('authorization') authHeader: string | undefined,
    @Query() query: QueryEmployeesDto,
  ): Promise<PaginatedEmployeesResponseDto> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.employeesService.listEmployees(principal, query);
  }

  @Post(':id/transfer')
  @ApiOperation({
    summary: 'Điều chuyển nhân viên sang chi nhánh mới (Chỉ Owner)',
    description:
      'Chỉ Chủ chuỗi (OWNER) có quyền thực hiện. Cập nhật chi nhánh nhà, lưu lịch sử điều chuyển, thu hồi phiên thu ngân đang mở tại chi nhánh cũ và ghi audit log.',
  })
  @ApiResponse({
    status: 200,
    description: 'Điều chuyển nhân viên thành công',
    type: EmployeeItemDto,
  })
  async transferEmployee(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') employeeId: string,
    @Body() dto: TransferEmployeeDto,
  ): Promise<EmployeeItemDto> {
    const principal = WebPrincipalUtil.requireOwner(authHeader);
    return this.employeesService.transferEmployee(principal, employeeId, dto);
  }

  @Get(':id/transfers')
  @ApiOperation({
    summary: 'Lịch sử điều chuyển chi nhánh của nhân viên',
    description:
      'Tra cứu danh sách các lần điều chuyển giữa các chi nhánh của nhân viên.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lịch sử điều chuyển',
    type: [TransferHistoryItemDto],
  })
  async getTransferHistory(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') employeeId: string,
  ): Promise<TransferHistoryItemDto[]> {
    const principal = WebPrincipalUtil.requireOwnerOrManager(authHeader);
    return this.employeesService.getTransferHistory(principal, employeeId);
  }
}
