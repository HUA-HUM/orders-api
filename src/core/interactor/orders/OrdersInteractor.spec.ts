import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IGetMegatoneOrdersRepository } from '../../adapters/repositories/marketplace/megatone/orders/IGetMegatoneOrdersRepository';
import type { IGetOncityOrdersRepository } from '../../adapters/repositories/marketplace/oncity/orders/IGetOncityOrdersRepository';
import { OrdersInteractor } from './OrdersInteractor';

describe('OrdersInteractor', () => {
  let interactor: OrdersInteractor;
  let megatoneRepository: jest.Mocked<IGetMegatoneOrdersRepository>;
  let oncityRepository: jest.Mocked<IGetOncityOrdersRepository>;
  let fravegaRepository: jest.Mocked<IGetFravegaOrdersRepository>;

  beforeEach(() => {
    megatoneRepository = {
      getByDateRange: jest.fn(),
    };

    oncityRepository = {
      getByDateRange: jest.fn(),
    };

    fravegaRepository = {
      getByPage: jest.fn(),
    };

    interactor = new OrdersInteractor(
      megatoneRepository,
      oncityRepository,
      fravegaRepository,
    );
  });

  it('returns normalized megatone orders for a range', async () => {
    megatoneRepository.getByDateRange.mockResolvedValueOnce([
      {
        IdOrden: 500005,
        Fecha: '2026-02-24T03:13:04.0000000+00:00',
        MontoVenta: 48402904,
        Cliente: {
          Nombre: 'Pablo',
          Apellido: 'Sebastian Fernando Benitez',
        },
        Estado: [
          {
            Descripcion: 'Cancelado',
            Fecha: '2026-02-24T03:24:11.0000000+00:00',
          },
        ],
      },
    ]);

    const response = await interactor.getMarketplaceOrders('megatone', {
      fechaDesde: '2026-02-24T00:00:00.000Z',
      fechaHasta: '2026-02-24T23:59:59.999Z',
    });

    expect(response.total).toBe(1);
    expect(response.items[0]).toMatchObject({
      marketplace: 'megatone',
      orderId: '500005',
      amount: 48402904,
      customerName: 'Pablo Sebastian Fernando Benitez',
      latestStatus: 'Cancelado',
    });
  });

  it('filters out provider orders that fall outside the last 24 hours', async () => {
    megatoneRepository.getByDateRange.mockResolvedValueOnce([
      {
        IdOrden: 1,
        Fecha: '2026-03-20T23:00:00.000Z',
        MontoVenta: 100,
      },
    ]);

    oncityRepository.getByDateRange.mockResolvedValueOnce([
      {
        IdOrden: 2,
        Fecha: '2026-03-20T23:30:00.000Z',
        MontoVenta: 200,
      },
      {
        IdOrden: 999,
        Fecha: '2026-02-20T21:00:00.000Z',
        MontoVenta: 999,
      },
    ]);

    fravegaRepository.getByPage.mockResolvedValueOnce({
      currentPage: 1,
      items: [
        {
          id: 3,
          createdAt: '2026-03-20T23:15:00.000Z',
          amount: 300,
        },
      ],
      pageSize: 100,
      pages: 1,
      scrollId: null,
      total: 1,
    });

    jest.useFakeTimers().setSystemTime(new Date('2026-03-21T22:45:22.570Z'));

    try {
      const response = await interactor.getLast24HoursOverview();

      expect(response.total).toBe(3);
      expect(response.marketplaces).toEqual([
        { marketplace: 'fravega', total: 1 },
        { marketplace: 'megatone', total: 1 },
        { marketplace: 'oncity', total: 1 },
      ]);
      expect(
        response.items.find((order) => order.orderId === '999'),
      ).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('supports 48-hour recent overviews', async () => {
    megatoneRepository.getByDateRange.mockResolvedValueOnce([
      {
        IdOrden: 10,
        Fecha: '2026-03-21T10:00:00.000Z',
        MontoVenta: 1000,
      },
    ]);

    oncityRepository.getByDateRange.mockResolvedValueOnce([]);
    fravegaRepository.getByPage.mockResolvedValueOnce({
      currentPage: 1,
      items: [],
      pageSize: 100,
      pages: 1,
      scrollId: null,
      total: 0,
    });

    jest.useFakeTimers().setSystemTime(new Date('2026-03-23T00:00:00.000Z'));

    try {
      const response = await interactor.getRecentHoursOverview(48);

      expect(response.range.from).toBe('2026-03-21T00:00:00.000Z');
      expect(response.range.to).toBe('2026-03-23T00:00:00.000Z');
      expect(response.total).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
