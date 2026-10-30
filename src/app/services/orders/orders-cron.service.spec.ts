import { SchedulerRegistry } from '@nestjs/schedule';
import { OrdersCronService } from './orders-cron.service';
import type { DispatchOrders } from '../../../core/interactor/orders/DispatchOrders';
import type { SyncOrderStatuses } from '../../../core/interactor/orders/SyncOrderStatuses';
import { DispatchInProgressError } from '../../../core/interactor/orders/OrdersProcessLock';

describe('OrdersCronService', () => {
  const ENV_KEYS = [
    'ORDERS_SYNC_CRON',
    'ORDERS_SYNC_CRON_ENABLED',
    'ORDERS_STATUS_CRON',
    'ORDERS_STATUS_CRON_ENABLED',
  ];
  const originalEnv = { ...process.env };

  let registry: SchedulerRegistry;
  let dispatchOrders: { run: jest.Mock };
  let syncOrderStatuses: { run: jest.Mock };
  let service: OrdersCronService;

  const scheduleOf = (name: string): string =>
    String(registry.getCronJob(name).cronTime.source);

  beforeEach(() => {
    ENV_KEYS.forEach((key) => delete process.env[key]);
    registry = new SchedulerRegistry();
    dispatchOrders = { run: jest.fn().mockResolvedValue({}) };
    syncOrderStatuses = { run: jest.fn().mockResolvedValue({}) };
    service = new OrdersCronService(
      registry,
      dispatchOrders as unknown as DispatchOrders,
      syncOrderStatuses as unknown as SyncOrderStatuses,
    );
  });

  afterEach(() => {
    registry.getCronJobs().forEach((job) => void job.stop());
    process.env = { ...originalEnv };
  });

  it('uses the default schedules when nothing is configured', () => {
    service.onModuleInit();

    expect(scheduleOf('orders-sync')).toBe('0 0 */2 * * *');
    expect(scheduleOf('orders-status-sync')).toBe('0 30 * * * *');
  });

  it('uses the schedules from the environment', () => {
    process.env.ORDERS_SYNC_CRON = '0 */15 * * * *';
    process.env.ORDERS_STATUS_CRON = '0 0 * * * *';

    service.onModuleInit();

    expect(scheduleOf('orders-sync')).toBe('0 */15 * * * *');
    expect(scheduleOf('orders-status-sync')).toBe('0 0 * * * *');
  });

  it('falls back to the default schedule when the expression is invalid', () => {
    process.env.ORDERS_SYNC_CRON = 'cada 2 horas';

    service.onModuleInit();

    expect(scheduleOf('orders-sync')).toBe('0 0 */2 * * *');
  });

  it('does not register a cron disabled with false', () => {
    process.env.ORDERS_STATUS_CRON_ENABLED = 'false';

    service.onModuleInit();

    expect(registry.doesExist('cron', 'orders-sync')).toBe(true);
    expect(registry.doesExist('cron', 'orders-status-sync')).toBe(false);
  });

  it('skips a tick while another orders process is running', async () => {
    dispatchOrders.run.mockRejectedValue(new DispatchInProgressError());
    service.onModuleInit();

    // No debe propagar el error: un rechazo sin manejar en un tick tira el proceso
    await registry.getCronJob('orders-sync').fireOnTick();

    expect(dispatchOrders.run).toHaveBeenCalledTimes(1);
  });
});
