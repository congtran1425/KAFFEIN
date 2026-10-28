import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DevicesModule } from '../devices/devices.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [DatabaseModule, DevicesModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
