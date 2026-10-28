import { Module } from '@nestjs/common';
import { CashierSessionsController } from './cashier-sessions.controller';
import { CashierSessionsService } from './cashier-sessions.service';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DatabaseModule, DevicesModule],
  controllers: [CashierSessionsController],
  providers: [CashierSessionsService],
  exports: [CashierSessionsService],
})
export class CashierSessionsModule {}
