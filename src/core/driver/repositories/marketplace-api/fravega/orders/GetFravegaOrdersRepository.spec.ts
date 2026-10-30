import {
  GetFravegaOrdersRepository,
  toSellerCentralDate,
} from './GetFravegaOrdersRepository';
import type { MarketplaceHttpClient } from '../../http/MarketplaceHttpClient';

describe('GetFravegaOrdersRepository', () => {
  it('listFullOrders sends the UTC range in Argentina time, as Seller Central filters', async () => {
    const http = { get: jest.fn().mockResolvedValue({ items: [] }) };
    const repository = new GetFravegaOrdersRepository(
      http as unknown as MarketplaceHttpClient,
    );

    // Compra real de las 21:50Z (18:50 en Argentina)
    await repository.listFullOrders({
      from: '2026-09-29T21:00:00.000Z',
      to: '2026-09-29T22:00:00.000Z',
      page: 1,
      pageSize: 50,
    });

    expect(http.get).toHaveBeenCalledWith('/fravega/full-orders', {
      purchasedatefrom: '2026-09-29T18:00:00.000Z',
      purchasedateto: '2026-09-29T19:00:00.000Z',
      page: 1,
      'page-size': 50,
    });
  });

  it.each([
    ['2026-10-30T02:00:00Z', '2026-10-29T23:00:00.000Z'],
    ['2026-10-30T14:30:00.000Z', '2026-10-30T11:30:00.000Z'],
    ['no-es-fecha', 'no-es-fecha'],
  ])('toSellerCentralDate(%s) = %s', (iso, expected) => {
    expect(toSellerCentralDate(iso)).toBe(expected);
  });
});
