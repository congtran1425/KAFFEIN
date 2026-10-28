import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StockReceiptsController } from './stock-receipts.controller';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StockReceiptsController],
  providers: [StockReceiptsService],
  exports: [StockReceiptsService],
})
export class StockReceiptsModule {}
