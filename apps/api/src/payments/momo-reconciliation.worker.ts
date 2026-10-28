import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

/** Same monolith, bounded batches; per-payment DB leases also protect multiple processes. */
@Injectable()
export class MomoReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MomoReconciliationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;

  constructor(private readonly payments: PaymentsService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.payments.reconcilePendingMomo();
    } catch {
      this.logger.warn(
        'MoMo reconciliation deferred; existing payments remain unresolved.',
      );
    } finally {
      this.running = false;
    }
  }
}
