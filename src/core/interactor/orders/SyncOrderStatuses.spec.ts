import { SyncOrderStatuses } from './SyncOrderStatuses';
import {
  DispatchInProgressError,
  OrdersProcessLock,
} from './OrdersProcessLock';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { PersistedOrder } from '../../entitis/madre-api/orders/OrdersPersistenceResponse';

describe('SyncOrderStatuses', () => {
  let fravegaRepository: { getFullOrder: jest.Mock };
  let persistenceRepository: {
    findPending: jest.Mock;
    updateStatus: jest.Mock;
  };
  let lock: OrdersProcessLock;
  let sync: SyncOrderStatuses;

  const pendingOrder = (
    id: number,
    suborderId: string,
    marketplace = 'fravega',
  ): PersistedOrder =>
    ({
      id,
      marketplace,
      unique_key: `${marketplace}:${suborderId}`,
      external_order_id: String(1000 + id),
      external_suborder_id: suborderId,
      persistence_status: 'PENDING',
    }) as PersistedOrder;

  const fravegaStatus = (
    sellerCentral: string,
    sellerCentralDelivery: string,
    vtex = 'ready-for-handling',
  ) => ({
    orderId: 1,
    suborderId: 'x',
    status: { sellerCentral, sellerCentralDelivery, vtex },
  });

  beforeEach(() => {
    fravegaRepository = { getFullOrder: jest.fn() };
    persistenceRepository = {
      findPending: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    lock = new OrdersProcessLock();
    sync = new SyncOrderStatuses(
      fravegaRepository as unknown as IGetFravegaOrdersRepository,
      persistenceRepository as unknown as IOrdersPersistenceRepository,
      lock,
    );
  });

  it('closes delivered and cancelled orders and leaves open ones PENDING', async () => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [
        pendingOrder(1, 'v1frvg-01'),
        pendingOrder(2, 'v2frvg-01'),
        pendingOrder(3, 'v3frvg-01'),
        pendingOrder(4, '9', 'megatone'),
      ],
    });
    fravegaRepository.getFullOrder.mockImplementation((suborderId: string) =>
      Promise.resolve(
        {
          'v1frvg-01': fravegaStatus('Invoiced', 'Delivered'),
          'v2frvg-01': fravegaStatus('Returned', 'Canceled'),
          'v3frvg-01': fravegaStatus('Invoiced', 'Pending'),
        }[suborderId],
      ),
    );

    const result = await sync.run();

    expect(fravegaRepository.getFullOrder).toHaveBeenCalledWith(
      'v1frvg-01',
      '1001',
    );
    expect(persistenceRepository.updateStatus).toHaveBeenCalledTimes(2);
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(1, {
      persistence_status: 'COMPLETED',
    });
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(2, {
      persistence_status: 'COMPLETED',
      last_error:
        '[CANCELLED] Seller Central: Returned (entrega Canceled), VTEX: ready-for-handling',
    });
    expect(result).toEqual({
      checked: 3,
      delivered: 1,
      cancelled: 1,
      open: 1,
      ignored: 1,
      errors: [],
    });
  });

  it('reports an order it cannot check and keeps going', async () => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [pendingOrder(1, 'v1frvg-01'), pendingOrder(2, 'v2frvg-01')],
    });
    fravegaRepository.getFullOrder
      .mockRejectedValueOnce(new Error('VTEX 500'))
      .mockResolvedValueOnce(fravegaStatus('Canceled', 'Pending', 'canceled'));

    const result = await sync.run();

    expect(result.errors).toEqual([
      { uniqueKey: 'fravega:v1frvg-01', message: 'VTEX 500' },
    ]);
    expect(result.cancelled).toBe(1);
  });

  it('does not run while another orders process holds the lock', async () => {
    let release: () => void = () => undefined;
    const busy = lock.run(
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    await expect(sync.run()).rejects.toBeInstanceOf(DispatchInProgressError);
    expect(persistenceRepository.findPending).not.toHaveBeenCalled();

    release();
    await busy;
  });
});
