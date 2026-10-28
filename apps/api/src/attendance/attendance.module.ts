import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DatabaseModule, DevicesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
