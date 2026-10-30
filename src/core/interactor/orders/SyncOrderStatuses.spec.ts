import { SyncOrderStatuses } from './SyncOrderStatuses';
import {
  DispatchInProgressError,
  OrdersProcessLock,
} from './OrdersProcessLock';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { IPowerAppsDispatchRepository } from '../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type { PersistedOrder } from '../../entitis/madre-api/orders/OrdersPersistenceResponse';

describe('SyncOrderStatuses', () => {
  let fravegaRepository: { getFullOrder: jest.Mock };
  let persistenceRepository: {
    findPending: jest.Mock;
    updateStatus: jest.Mock;
  };
  let powerAppsRepository: { createSale: jest.Mock };
  let lock: OrdersProcessLock;
  let sync: SyncOrderStatuses;

  const pendingOrder = (
    id: number,
    suborderId: string,
    marketplace = 'fravega',
    vbi: Partial<PersistedOrder> = {},
  ): PersistedOrder =>
    ({
      id,
      marketplace,
      unique_key: `${marketplace}:${suborderId}`,
      external_order_id: String(1000 + id),
      external_suborder_id: suborderId,
      persistence_status: 'PENDING',
      notification_system_b_status: null,
      floxu_code: null,
      ...vbi,
    }) as PersistedOrder;

  // Enviada a VBI pero todavia sin numero TLQV
  const sentWithoutTlqt = { notification_system_b_status: 'success' };

  const vbiDuplicate = (tlqtNumber: string | null) => ({
    ok: true,
    duplicate: true,
    saleId: 'sale-1',
    nroVenta: '1001',
    tlqtNumber,
  });

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
    powerAppsRepository = { createSale: jest.fn() };
    lock = new OrdersProcessLock();
    sync = new SyncOrderStatuses(
      fravegaRepository as unknown as IGetFravegaOrdersRepository,
      persistenceRepository as unknown as IOrdersPersistenceRepository,
      powerAppsRepository as unknown as IPowerAppsDispatchRepository,
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
      tlqtFilled: 0,
      ignored: 1,
      errors: [],
    });
  });

  it('fills the missing TLQV number of an open order already sent to VBI', async () => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [pendingOrder(1, 'v1frvg-01', 'fravega', sentWithoutTlqt)],
    });
    fravegaRepository.getFullOrder.mockResolvedValue(
      fravegaStatus('Created', 'Pending'),
    );
    powerAppsRepository.createSale.mockResolvedValue(
      vbiDuplicate('TLQV-22733'),
    );

    const result = await sync.run();

    expect(powerAppsRepository.createSale).toHaveBeenCalledTimes(1);
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(1, {
      floxu_code: 'TLQV-22733',
    });
    expect(result).toMatchObject({ open: 1, tlqtFilled: 1, errors: [] });
  });

  it('saves the TLQV number and the delivery in a single update', async () => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [pendingOrder(1, 'v1frvg-01', 'fravega', sentWithoutTlqt)],
    });
    fravegaRepository.getFullOrder.mockResolvedValue(
      fravegaStatus('Invoiced', 'Delivered'),
    );
    powerAppsRepository.createSale.mockResolvedValue(
      vbiDuplicate('TLQV-22733'),
    );

    await sync.run();

    expect(persistenceRepository.updateStatus).toHaveBeenCalledTimes(1);
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(1, {
      persistence_status: 'COMPLETED',
      floxu_code: 'TLQV-22733',
    });
  });

  it.each([
    ['was never sent to VBI', {}],
    ['already has a TLQV number', { ...sentWithoutTlqt, floxu_code: 'TLQV-1' }],
    ['failed in VBI', { notification_system_b_status: 'failed' }],
  ])('does not resend an order that %s', async (_, vbi) => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [pendingOrder(1, 'v1frvg-01', 'fravega', vbi)],
    });
    fravegaRepository.getFullOrder.mockResolvedValue(
      fravegaStatus('Created', 'Pending'),
    );

    await sync.run();

    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(persistenceRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('does not resend a cancelled order but still closes it', async () => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [pendingOrder(1, 'v1frvg-01', 'fravega', sentWithoutTlqt)],
    });
    fravegaRepository.getFullOrder.mockResolvedValue(
      fravegaStatus('Returned', 'Canceled'),
    );

    const result = await sync.run();

    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(1);
  });

  it('keeps the order open when VBI still has no TLQV number', async () => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [pendingOrder(1, 'v1frvg-01', 'fravega', sentWithoutTlqt)],
    });
    fravegaRepository.getFullOrder.mockResolvedValue(
      fravegaStatus('Created', 'Pending'),
    );
    powerAppsRepository.createSale.mockResolvedValue(vbiDuplicate(null));

    const result = await sync.run();

    expect(persistenceRepository.updateStatus).not.toHaveBeenCalled();
    expect(result).toMatchObject({ open: 1, tlqtFilled: 0 });
  });

  it('closes the order even if VBI fails while fetching the TLQV number', async () => {
    persistenceRepository.findPending.mockResolvedValue({
      items: [pendingOrder(1, 'v1frvg-01', 'fravega', sentWithoutTlqt)],
    });
    fravegaRepository.getFullOrder.mockResolvedValue(
      fravegaStatus('Invoiced', 'Delivered'),
    );
    powerAppsRepository.createSale.mockRejectedValue(new Error('VBI 500'));

    const result = await sync.run();

    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(1, {
      persistence_status: 'COMPLETED',
    });
    expect(result.delivered).toBe(1);
    expect(result.errors).toEqual([
      {
        uniqueKey: 'fravega:v1frvg-01',
        message: 'No se pudo completar el numero TLQV: VBI 500',
      },
    ]);
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
