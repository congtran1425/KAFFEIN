import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { ActiveWebPrincipalGuard } from './common/security/active-web-principal.guard';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { AttendanceModule } from './attendance/attendance.module';
import { CashierSessionsModule } from './cashier-sessions/cashier-sessions.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { RegisterSessionsModule } from './register-sessions/register-sessions.module';
import { SyncModule } from './sync/sync.module';
import { ReportsModule } from './reports/reports.module';
import { EmployeesModule } from './employees/employees.module';
import { StockReceiptsModule } from './stock-receipts/stock-receipts.module';
import { StoresModule } from './stores/stores.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    DevicesModule,
    StoresModule,
    AttendanceModule,
    CashierSessionsModule,
    CatalogModule,
    InventoryModule,
    SalesModule,
    PaymentsModule,
    RegisterSessionsModule,
    SyncModule,
    ReportsModule,
    EmployeesModule,
    StockReceiptsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ActiveWebPrincipalGuard }],
})
export class AppModule {}
