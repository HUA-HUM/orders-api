import { PersistMarketplaceOrders } from './PersistMarketplaceOrders';
import type { OrdersInteractor } from './OrdersInteractor';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { MarketplaceName, NormalizedOrder } from '../../entitis/orders/Orders';

describe('PersistMarketplaceOrders', () => {
  let ordersInteractor: { getMarketplaceOrders: jest.Mock };
  let fravegaRepository: { getByPage: jest.Mock; getDetail: jest.Mock };
  let persistenceRepository: {
    insert: jest.Mock;
    findByUniqueKey: jest.Mock;
    updateStatus: jest.Mock;
  };
  let orchestrator: PersistMarketplaceOrders;

  const orderFor = (
    marketplace: MarketplaceName,
    overrides: Partial<NormalizedOrder> = {},
  ): NormalizedOrder => ({
    marketplace,
    orderId: '1',
    createdAt: '2026-05-10T11:02:00.000Z',
    amount: 1000,
    customerName: 'X',
    latestStatus: 'ok',
    raw: {},
    ...overrides,
  });

  const emptyResult = (marketplace: MarketplaceName) => ({
    marketplace,
    range: { from: 'a', to: 'b' },
    total: 0,
    items: [] as NormalizedOrder[],
  });

  beforeEach(() => {
    ordersInteractor = { getMarketplaceOrders: jest.fn() };
    fravegaRepository = { getByPage: jest.fn(), getDetail: jest.fn() };
    persistenceRepository = {
      insert: jest.fn(),
      findByUniqueKey: jest.fn(),
      updateStatus: jest.fn(),
    };
    orchestrator = new PersistMarketplaceOrders(
      ordersInteractor as unknown as OrdersInteractor,
      fravegaRepository as unknown as IGetFravegaOrdersRepository,
      persistenceRepository as unknown as IOrdersPersistenceRepository,
    );
  });

  it('pulls each marketplace and persists, aggregating inserted/skipped', async () => {
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      (marketplace: MarketplaceName) => {
        if (marketplace === 'megatone') {
          return Promise.resolve({
            marketplace,
            range: { from: 'a', to: 'b' },
            total: 1,
            items: [orderFor('megatone')],
          });
        }
        return Promise.resolve(emptyResult(marketplace));
      },
    );
    persistenceRepository.insert.mockResolvedValue({
      status: 'ok',
      total: 1,
      inserted: 1,
      skipped: 0,
    });

    const result = await orchestrator.run();

    expect(persistenceRepository.insert).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(0);
    expect(result.results).toContainEqual({
      marketplace: 'megatone',
      inserted: 1,
      skipped: 0,
    });
  });

  it('enriches fravega orders with email from the detail before persisting', async () => {
    const fravegaOrder = orderFor('fravega', {
      orderId: '18521376',
      suborderId: 'v90520163frvg-01',
    });
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      (marketplace: MarketplaceName) => {
        if (marketplace === 'fravega') {
          return Promise.resolve({
            marketplace,
            range: { from: 'a', to: 'b' },
            total: 1,
            items: [fravegaOrder],
          });
        }
        return Promise.resolve(emptyResult(marketplace));
      },
    );
    fravegaRepository.getDetail.mockResolvedValue({
      billingInfo: { billingPerson: { email: 'jeismara@example.com' } },
    });
    persistenceRepository.insert.mockResolvedValue({
      status: 'ok',
      total: 1,
      inserted: 1,
      skipped: 0,
    });

    await orchestrator.run();

    expect(fravegaRepository.getDetail).toHaveBeenCalledWith(
      'v90520163frvg-01',
      '18521376',
    );
    expect(persistenceRepository.insert).toHaveBeenCalledWith([
      expect.objectContaining({ email: 'jeismara@example.com' }),
    ]);
  });

  it('does not pull oncity (excluded from the ingest flow)', async () => {
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      (marketplace: MarketplaceName) => Promise.resolve(emptyResult(marketplace)),
    );

    await orchestrator.run();

    const pulled = ordersInteractor.getMarketplaceOrders.mock.calls.map(
      (call) => call[0],
    );
    expect(pulled).not.toContain('oncity');
    expect(pulled).toEqual(expect.arrayContaining(['fravega', 'megatone']));
  });

  it('a failing marketplace does not stop the others', async () => {
    ordersInteractor.getMarketplaceOrders.mockImplementation(
      (marketplace: MarketplaceName) => {
        if (marketplace === 'megatone') {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve(emptyResult(marketplace));
      },
    );

    const result = await orchestrator.run();

    expect(result.errors).toContainEqual({
      marketplace: 'megatone',
      message: 'boom',
    });
    expect(result.results.length).toBeGreaterThan(0);
  });
});
