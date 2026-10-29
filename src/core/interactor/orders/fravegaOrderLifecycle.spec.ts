import {
  closingStatusUpdate,
  resolveFravegaLifecycle,
} from './fravegaOrderLifecycle';
import type { FravegaFullOrderResponse } from '../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';

describe('resolveFravegaLifecycle', () => {
  const withStatus = (
    sellerCentral: string,
    sellerCentralDelivery: string | null,
    vtex: string | null,
  ): FravegaFullOrderResponse => ({
    orderId: 1,
    suborderId: 'v1frvg-01',
    status: { sellerCentral, sellerCentralDelivery, vtex },
  });

  // Combinaciones vistas en ordenes reales (29/10)
  it.each([
    ['Created', 'Pending', 'ready-for-handling'],
    ['Invoiced', 'Pending', 'ready-for-handling'],
  ])('keeps %s / %s / %s open', (sc, delivery, vtex) => {
    expect(resolveFravegaLifecycle(withStatus(sc, delivery, vtex))).toEqual({
      state: 'open',
    });
  });

  it.each([
    ['Returned', 'Canceled', 'ready-for-handling'],
    ['Returned', 'Canceled', 'canceled'],
    ['Canceled', 'Pending', 'canceled'],
    ['Created', 'Pending', 'canceled'],
  ])('treats %s / %s / %s as cancelled', (sc, delivery, vtex) => {
    expect(resolveFravegaLifecycle(withStatus(sc, delivery, vtex)).state).toBe(
      'cancelled',
    );
  });

  it('treats a delivered order as delivered', () => {
    expect(
      resolveFravegaLifecycle(withStatus('Invoiced', 'Delivered', 'invoiced')),
    ).toEqual({ state: 'delivered' });
  });

  it('builds the madre update for each final state', () => {
    expect(closingStatusUpdate({ state: 'open' })).toBeNull();
    expect(closingStatusUpdate({ state: 'delivered' })).toEqual({
      persistence_status: 'COMPLETED',
    });
    expect(closingStatusUpdate({ state: 'cancelled', detail: 'x' })).toEqual({
      persistence_status: 'COMPLETED',
      last_error: '[CANCELLED] x',
    });
  });
});
