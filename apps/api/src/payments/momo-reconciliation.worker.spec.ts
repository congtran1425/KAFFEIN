import { MomoReconciliationWorker } from './momo-reconciliation.worker';
import { PaymentsService } from './payments.service';

describe('MoMo background reconciliation', () => {
  it('coalesces overlapping ticks and resumes after failure', async () => {
    let release!: () => void;
    const reconcilePendingMomo = jest.fn().mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const worker = new MomoReconciliationWorker({
      reconcilePendingMomo,
    } as unknown as PaymentsService);
    const first = worker.tick();
    await worker.tick();
    expect(reconcilePendingMomo).toHaveBeenCalledTimes(1);
    release();
    await first;
    reconcilePendingMomo.mockRejectedValueOnce(new Error('DB unavailable'));
    await worker.tick();
    await worker.tick();
    expect(reconcilePendingMomo).toHaveBeenCalledTimes(3);
    worker.onModuleDestroy();
    await worker.tick();
    expect(reconcilePendingMomo).toHaveBeenCalledTimes(3);
  });
});
