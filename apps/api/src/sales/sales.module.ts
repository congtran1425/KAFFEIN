import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [DatabaseModule, DevicesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
