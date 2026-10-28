import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RegisterSessionsModule } from '../register-sessions/register-sessions.module';
import { SalesModule } from '../sales/sales.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [
    DatabaseModule,
    DevicesModule,
    SalesModule,
    InventoryModule,
    RegisterSessionsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
