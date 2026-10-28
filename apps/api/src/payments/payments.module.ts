import { MomoSandboxProvider } from './momo-sandbox.provider';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';
import { SalesModule } from '../sales/sales.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ZaloPaySandboxProvider } from './zalopay-sandbox.provider';
import { MomoReconciliationWorker } from './momo-reconciliation.worker';

@Module({
  imports: [DatabaseModule, DevicesModule, SalesModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    ZaloPaySandboxProvider,
    MomoSandboxProvider,
    MomoReconciliationWorker,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
