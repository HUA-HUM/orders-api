import {
  DispatchInProgressError,
  DispatchOrderNotRetryableError,
  DispatchOrders,
} from './DispatchOrders';
import { OrdersProcessLock } from './OrdersProcessLock';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IPowerAppsDispatchRepository } from '../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type {
  FravegaFullOrderError,
  FravegaFullOrderResponse,
  GetFravegaFullOrdersResponse,
} from '../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';
import type { NormalizedOrder } from '../../entitis/orders/Orders';

describe('DispatchOrders', () => {
  let fravegaRepository: {
    listOrders: jest.Mock;
    listFullOrders: jest.Mock;
    getFullOrder: jest.Mock;
  };
  let powerAppsRepository: { createSale: jest.Mock };
  let persistenceRepository: {
    insert: jest.Mock;
    findByUniqueKey: jest.Mock;
    updateStatus: jest.Mock;
  };
  let orchestrator: DispatchOrders;

  const fullOrder = (
    overrides: Partial<FravegaFullOrderResponse> = {},
  ): FravegaFullOrderResponse => ({
    orderId: 19836023,
    suborderId: 'v93713051frvg-01',
    vtexOrderId: 'FVG-v93713051frvg-01',
    status: { sellerCentral: 'Created', vtex: 'ready-for-handling' },
    purchaseDate: '2026-10-03T01:27:38.512Z',
    estimatedDeliveryDate: '2026-10-24T00:00:00.000Z',
    buyer: {
      fullName: 'Gabriela Hidalgo',
      documentType: 'DNI',
      documentNumber: '25327587',
      cuil: '27253275877',
      email: 'g@example.com',
      phone: '+5491100000000',
    },
    shipping: {
      street: 'Pedraza',
      number: '990',
      city: 'El Plumerillo',
      state: 'Mendoza',
      zipCode: '5539',
    },
    items: [
      {
        asin: 'B0DCNMTYKS',
        vtexSkuId: '32797490',
        name: 'Alforja',
        quantity: 1,
      },
    ],
    totals: { total: 1103000 },
    ...overrides,
  });

  const page = (
    items: FravegaFullOrderResponse[],
    options: { pages?: number; errors?: FravegaFullOrderError[] } = {},
  ): GetFravegaFullOrdersResponse => ({
    currentPage: 1,
    pages: options.pages ?? 1,
    pageSize: 50,
    total: items.length,
    items,
    errors: options.errors ?? [],
  });

  /* findByUniqueKey: primero no existe, despues del insert existe con ese id */
  const newOrderInMadre = (id: number) => {
    persistenceRepository.findByUniqueKey
      .mockResolvedValueOnce({ exists: false, order: null })
      .mockResolvedValueOnce({ exists: true, order: { id } });
  };

  const sentToVbi = (): NormalizedOrder =>
    (powerAppsRepository.createSale.mock.calls[0] as [NormalizedOrder])[0];

  beforeEach(() => {
    fravegaRepository = {
      listOrders: jest.fn(),
      listFullOrders: jest.fn(),
      getFullOrder: jest.fn(),
    };
    powerAppsRepository = { createSale: jest.fn() };
    persistenceRepository = {
      insert: jest.fn().mockResolvedValue({ inserted: 1, skipped: 0 }),
      findByUniqueKey: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    orchestrator = new DispatchOrders(
      fravegaRepository as unknown as IGetFravegaOrdersRepository,
      powerAppsRepository as unknown as IPowerAppsDispatchRepository,
      persistenceRepository as unknown as IOrdersPersistenceRepository,
      new OrdersProcessLock(),
    );
  });

  it('persists a new order in madre, sends it to VBI and keeps it PENDING while open in Fravega', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(page([fullOrder()]));
    newOrderInMadre(7);
    powerAppsRepository.createSale.mockResolvedValue({
      ok: true,
      saleId: '1',
      nroVenta: '25',
      tlqtNumber: 'TLQV-36120',
    });

    const result = await orchestrator.run();

    expect(persistenceRepository.insert).toHaveBeenCalledTimes(1);
    expect(sentToVbi()).toMatchObject({
      orderId: '19836023',
      suborderId: 'v93713051frvg-01',
      customer: { document: '27253275877', email: 'g@example.com' },
    });
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(7, {
      persistence_status: 'PENDING',
      notification_system_b_status: 'success',
      floxu_code: 'TLQV-36120',
      last_error: null,
    });
    expect(result).toMatchObject({ collected: 1, dispatched: 1, failed: 0 });
  });

  it('marks COMPLETED a new order that Fravega already delivered', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(
      page([
        fullOrder({
          status: {
            sellerCentral: 'Invoiced',
            sellerCentralDelivery: 'Delivered',
            vtex: 'invoiced',
          },
        }),
      ]),
    );
    newOrderInMadre(7);
    powerAppsRepository.createSale.mockResolvedValue({
      ok: true,
      saleId: '1',
      nroVenta: '25',
      tlqtNumber: 'TLQV-36120',
    });

    await orchestrator.run();

    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ persistence_status: 'COMPLETED' }),
    );
  });

  it('does not send to VBI a new order already returned in Fravega', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(
      page([
        fullOrder({
          status: {
            sellerCentral: 'Returned',
            sellerCentralDelivery: 'Canceled',
            vtex: 'ready-for-handling',
          },
        }),
      ]),
    );
    newOrderInMadre(7);

    const result = await orchestrator.run();

    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(7, {
      persistence_status: 'COMPLETED',
      last_error:
        '[CANCELLED] Seller Central: Returned (entrega Canceled), VTEX: ready-for-handling',
    });
    expect(result).toMatchObject({ dispatched: 0, cancelled: 1, failed: 0 });
  });

  it('skips an order that already exists in madre', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(page([fullOrder()]));
    persistenceRepository.findByUniqueKey.mockResolvedValue({
      exists: true,
      order: { id: 1 },
    });

    const result = await orchestrator.run();

    expect(persistenceRepository.findByUniqueKey).toHaveBeenCalledWith(
      'fravega:v93713051frvg-01',
    );
    expect(persistenceRepository.insert).not.toHaveBeenCalled();
    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: 1, dispatched: 0 });
  });

  it('marks FAILED with MISSING_DATA when cuil is missing and does not call VBI', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(
      page([fullOrder({ buyer: { ...fullOrder().buyer, cuil: '' } })]),
    );
    newOrderInMadre(8);

    const result = await orchestrator.run();

    expect(persistenceRepository.insert).toHaveBeenCalledTimes(1);
    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(8, {
      persistence_status: 'FAILED',
      last_error: '[MISSING_DATA] Faltan datos del comprador: document',
    });
    expect(result.failed).toBe(1);
  });

  it('treats the masked VTEX email as missing', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(
      page([
        fullOrder({
          buyer: { ...fullOrder().buyer, email: 'abc123@ct.vtex.com.br' },
        }),
      ]),
    );
    newOrderInMadre(9);

    await orchestrator.run();

    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        persistence_status: 'FAILED',
        last_error: '[MISSING_DATA] Faltan datos del comprador: email',
      }),
    );
  });

  it('marks FAILED with VBI_ERROR when VBI rejects the sale', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(page([fullOrder()]));
    newOrderInMadre(10);
    powerAppsRepository.createSale.mockRejectedValue(
      new Error('PowerApps respondio 500: boom'),
    );

    const result = await orchestrator.run();

    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(10, {
      notification_system_b_status: 'failed',
      persistence_status: 'FAILED',
      last_error: '[VBI_ERROR] PowerApps respondio 500: boom',
    });
    expect(result.errors).toContainEqual({
      orderId: '19836023',
      stage: 'powerapps',
      message: '[VBI_ERROR] PowerApps respondio 500: boom',
    });
  });

  it('persists orders that marketplace-api could not complete as FAILED SOURCE_ERROR', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(
      page([], {
        errors: [
          {
            orderId: 1,
            suborderId: 'v1frvg-01',
            source: 'vtex',
            message: 'VTEX 404',
          },
        ],
      }),
    );
    newOrderInMadre(11);

    const result = await orchestrator.run();

    const [[inserted]] = persistenceRepository.insert.mock.calls as [
      [NormalizedOrder],
    ][];
    expect(inserted[0]).toMatchObject({
      orderId: '1',
      suborderId: 'v1frvg-01',
    });
    expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(11, {
      persistence_status: 'FAILED',
      last_error: '[SOURCE_ERROR] vtex: VTEX 404',
    });
    expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    expect(result).toMatchObject({ collected: 1, failed: 1 });
  });

  it('reads every page even when Fravega returns short pages', async () => {
    fravegaRepository.listFullOrders
      .mockResolvedValueOnce(page([], { pages: 3 }))
      .mockResolvedValueOnce(page([fullOrder()], { pages: 3 }))
      .mockResolvedValueOnce(page([], { pages: 3 }));
    persistenceRepository.findByUniqueKey.mockResolvedValue({
      exists: true,
      order: { id: 1 },
    });

    const result = await orchestrator.run();

    expect(fravegaRepository.listFullOrders).toHaveBeenCalledTimes(3);
    expect(result.collected).toBe(1);
  });

  it('starts the next automatic sync where the previous one ended', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(page([]));

    const first = await orchestrator.run();
    await orchestrator.run();

    const secondFrom = (
      fravegaRepository.listFullOrders.mock.calls[1] as [{ from: string }]
    )[0].from;
    const expected = new Date(
      new Date(first.window.to).getTime() - 30 * 60 * 1000,
    ).toISOString();
    expect(secondFrom).toBe(expected);
  });

  it('does not move the sync mark when collecting fails', async () => {
    fravegaRepository.listFullOrders
      .mockRejectedValueOnce(new Error('marketplace-api caido'))
      .mockResolvedValue(page([]));

    const failed = await orchestrator.run();
    const next = await orchestrator.run();

    // Sin marca: el siguiente sync vuelve a mirar el lookback completo (24h + 30min)
    const lookbackMs =
      new Date(next.window.to).getTime() - new Date(next.window.from).getTime();
    expect(failed.errors[0]).toMatchObject({ stage: 'collect' });
    expect(lookbackMs).toBe((24 * 60 + 30) * 60 * 1000);
  });

  it('uses the manual range without moving the sync mark', async () => {
    fravegaRepository.listFullOrders.mockResolvedValue(page([]));
    const range = {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
    };

    const manual = await orchestrator.run(range);
    const automatic = await orchestrator.run();

    expect(manual.window).toEqual(range);
    expect(fravegaRepository.listFullOrders).toHaveBeenCalledWith(
      expect.objectContaining(range),
    );
    expect(automatic.window.from).not.toBe(range.to);
  });

  it('rejects a second run while one is in progress', async () => {
    let release: (value: GetFravegaFullOrdersResponse) => void = () => {};
    fravegaRepository.listFullOrders.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const first = orchestrator.run();

    await expect(orchestrator.run()).rejects.toBeInstanceOf(
      DispatchInProgressError,
    );
    release(page([]));
    await first;
  });

  describe('retry', () => {
    const persisted = (persistence_status: string) => ({
      exists: true,
      order: {
        id: 12,
        marketplace: 'fravega',
        external_order_id: '19836023',
        external_suborder_id: 'v93713051frvg-01',
        persistence_status,
      },
    });

    it('re-fetches a FAILED order and leaves it PENDING when VBI accepts it', async () => {
      persistenceRepository.findByUniqueKey.mockResolvedValue(
        persisted('FAILED'),
      );
      fravegaRepository.getFullOrder.mockResolvedValue(fullOrder());
      powerAppsRepository.createSale.mockResolvedValue({
        ok: true,
        saleId: null,
        nroVenta: null,
        tlqtNumber: null,
      });

      const result = await orchestrator.retry('fravega:v93713051frvg-01');

      expect(fravegaRepository.getFullOrder).toHaveBeenCalledWith(
        'v93713051frvg-01',
        '19836023',
      );
      expect(persistenceRepository.insert).not.toHaveBeenCalled();
      expect(result).toEqual({
        uniqueKey: 'fravega:v93713051frvg-01',
        persistence_status: 'PENDING',
        last_error: null,
      });
    });

    it('recovers an order VBI already had: duplicate leaves it PENDING with the TLQV number', async () => {
      persistenceRepository.findByUniqueKey.mockResolvedValue(
        persisted('FAILED'),
      );
      fravegaRepository.getFullOrder.mockResolvedValue(fullOrder());
      powerAppsRepository.createSale.mockResolvedValue({
        ok: true,
        duplicate: true,
        saleId: '17c6d931-5bd4-f111-84ea-70a8a59b66be',
        nroVenta: '19836023',
        tlqtNumber: 'TLQV-22733',
      });

      const result = await orchestrator.retry('fravega:v93713051frvg-01');

      expect(persistenceRepository.updateStatus).toHaveBeenCalledWith(
        expect.any(Number),
        {
          persistence_status: 'PENDING',
          notification_system_b_status: 'success',
          floxu_code: 'TLQV-22733',
          last_error: null,
        },
      );
      expect(result.persistence_status).toBe('PENDING');
    });

    it('refuses to retry an order that is not FAILED', async () => {
      persistenceRepository.findByUniqueKey.mockResolvedValue(
        persisted('COMPLETED'),
      );

      await expect(
        orchestrator.retry('fravega:v93713051frvg-01'),
      ).rejects.toBeInstanceOf(DispatchOrderNotRetryableError);
      expect(powerAppsRepository.createSale).not.toHaveBeenCalled();
    });
  });
});
