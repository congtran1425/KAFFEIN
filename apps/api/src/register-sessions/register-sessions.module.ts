import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';
import { RegisterSessionsController } from './register-sessions.controller';
import { RegisterSessionsService } from './register-sessions.service';

@Module({
  imports: [DatabaseModule, DevicesModule],
  controllers: [RegisterSessionsController],
  providers: [RegisterSessionsService],
  exports: [RegisterSessionsService],
})
export class RegisterSessionsModule {}
