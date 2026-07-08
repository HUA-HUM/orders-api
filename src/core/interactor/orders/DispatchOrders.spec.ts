import { DispatchOrders } from './DispatchOrders';
import type { OrdersInteractor } from './OrdersInteractor';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IFlokzuDispatchRepository } from '../../adapters/repositories/dispatch/flokzu/IFlokzuDispatchRepository';
import type { IPowerAppsDispatchRepository } from '../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type {
  MarketplaceName,
  NormalizedOrder,
} from '../../entitis/orders/Orders';

describe('DispatchOrders', () => {
  let ordersInteractor: { getMarketplaceOrders: jest.Mock };
  let fravegaRepository: {
    listOrders: jest.Mock;
    getOrder: jest.Mock;
    listLegacyOrders: jest.Mock;
  };
  let flokzuRepository: { createInstance: jest.Mock };
  let powerAppsRepository: { createSale: jest.Mock };
  let persistenceRepository: {
    insert: jest.Mock;
    findByUniqueKey: jest.Mock;
    updateStatus: jest.Mock;
  };
  let orchestrator: DispatchOrders;

  const fravegaOrder = (): NormalizedOrder => ({
    marketplace: 'fravega',
    orderId: 'FVG-v90520163frvg-01',
    suborderId: 'v90520163frvg-01',
    createdAt: '2026-05-10T11:02:00.000Z',
    amount: 1000,
    latestStatus: 'ready-for-handling',
    customer: {
      name: 'Gabriela',
      document: '27253275877',
      phone: '+5491100000000',
      email: 'g@example.com',
    },
    shipping: {
      address: 'calle 1',
      city: 'CABA',
      province: 'BS AS',
      zipCode: '1000',
      estimatedDeliveryDate: null,
    },
    items: [{ sku: 'B0X', sellerSku: '1', name: 'Producto', quantity: 1 }],
    raw: {},
  });

  const onlyFravega =
    (order: NormalizedOrder) => (marketplace: MarketplaceName) =>
      Promise.resolve({
        marketplace,
        range: { from: 'a', to: 'b' },
        total: marketplace === 'fravega' ? 1 : 0,
        items: marketplace === 'fravega' ? [order] : [],
      });

  beforeEach(() => {
    ordersInteractor = { getMarketplaceOrders: jest.fn() };
    fravegaRepository = {
      listOrders: jest.fn(),
      getOrder: jest.fn(),
      listLegacyOrders: jest.fn(),
    };
    flokzuRepository = { createInstance: jest.fn() };
    powerAppsRepository = { createSale: jest.fn() };
    persistenceRepository = {
      insert: jest.fn(),
      findByUniqueKey: jest.fn(),
      updateStatus: jest.fn(),
    };
    orchestrator = new DispatchOrders(
      ordersInteractor as unknown as OrdersInteractor,
      fravegaRepository as unknown as IGetFravegaOrdersRepository,
      flokzuRepository as unknown as IFlokzuDispatchRepository,
      powerAppsRepository as unknown as IPowerAppsDispatchRepository,
      persistenceRepository as unknown as IOrdersPersistenceRepository,
    );
    fravegaRepository.getOrder.mockResolvedValue({
      clientProfileData: {},
      items: [],
    });
    fravegaRepository.listLegacyOrders.mockResolvedValue({ items: [] });
  });

  it('dispatches a new order: flokzu -> powerapps -> persist with TLQV', async () => {
    const order = fravegaOrder();
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      onlyFravega(order),
    );
    persistenceRepository.findByUniqueKey
      .mockResolvedValueOnce({ exists: false, order: null })
      .mockResolvedValueOnce({ exists: true, order: { id: 7 } });
    flokzuRepository.createInstance.mockResolvedValue({
      identifier: 'TLQV-99',
    });
    powerAppsRepository.createSale.mockResolvedValue({ ok: true });
    persistenceRepository.insert.mockResolvedValue({ inserted: 1, skipped: 0 });
    persistenceRepository.updateStatus.mockResolvedValue({ status: 'ok' });

    const result = await orchestrator.run();

    expect(flokzuRepository.createInstance).toHaveBeenCalledTimes(1);
    expect(powerAppsRepository.createSale).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'FVG-v90520163frvg-01' }),
      'TLQV-99',
    );
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        persistence_status: 'COMPLETED',
        floxu_code: 'TLQV-99',
      }),
    );
    expect(result.dispatched).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('overrides CUITCOMPRADOR with the legacy cuil matched by suborderId', async () => {
    const order = fravegaOrder();
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      onlyFravega(order),
    );
    fravegaRepository.getOrder.mockResolvedValue({
      clientProfileData: { document: '40111111' },
      items: [],
    });
    fravegaRepository.listLegacyOrders.mockResolvedValue({
      items: [{ suborderId: 'v90520163frvg-01', cuil: '20999999997' }],
    });
    persistenceRepository.findByUniqueKey
      .mockResolvedValueOnce({ exists: false, order: null })
      .mockResolvedValueOnce({ exists: true, order: { id: 9 } });
    flokzuRepository.createInstance.mockResolvedValue({ identifier: 'TLQV-1' });
    powerAppsRepository.createSale.mockResolvedValue({ ok: true });
    persistenceRepository.insert.mockResolvedValue({ inserted: 1, skipped: 0 });
    persistenceRepository.updateStatus.mockResolvedValue({ status: 'ok' });

    await orchestrator.run();

    const [dispatched] = flokzuRepository.createInstance.mock.calls[0] as [
      NormalizedOrder,
    ];
    expect(dispatched.customer.document).toBe('20999999997');
  });

  it('skips an order that already exists (no dispatch)', async () => {
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      onlyFravega(fravegaOrder()),
    );
    persistenceRepository.findByUniqueKey.mockResolvedValue({
      exists: true,
      order: { id: 1 },
    });

    const result = await orchestrator.run();

    expect(flokzuRepository.createInstance).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.dispatched).toBe(0);
  });

  it('records a flokzu failure and does not call powerapps nor persist', async () => {
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      onlyFravega(fravegaOrder()),
    );
    persistenceRepository.findByUniqueKey.mockResolvedValue({
      exists: false,
      order: null,
    });
    flokzuRepository.createInstance.mockRejectedValue(new Error('flokzu down'));

    const result = await orchestrator.run();

    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(persistenceRepository.insert).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.errors).toContainEqual({
      orderId: 'FVG-v90520163frvg-01',
      stage: 'flokzu',
      message: 'flokzu down',
    });
  });
});
