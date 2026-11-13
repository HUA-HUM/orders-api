import type { NormalizedOrder } from '../../../entitis/orders/Orders';
import { emptyCustomer, emptyShipping } from '../../../entitis/orders/Orders';
import { toTeamsOrderPayload } from './toTeamsOrderPayload';

describe('toTeamsOrderPayload', () => {
  const order = (
    overrides: Partial<NormalizedOrder> = {},
  ): NormalizedOrder => ({
    marketplace: 'fravega',
    orderId: '20277852',
    suborderId: 'v95020273frvg-01',
    createdAt: '2026-11-12T19:28:12.576Z',
    amount: 367247,
    productsAmount: 367247,
    latestStatus: 'Created',
    customer: { ...emptyCustomer(), name: 'Juana Perez' },
    shipping: emptyShipping(),
    items: [{ sku: 'B0ASIN', sellerSku: '1', name: 'Heladera', quantity: 1 }],
    raw: {},
    ...overrides,
  });

  const firstLine = (payload: Record<string, unknown>) =>
    String(payload.mensaje).split('\n')[0];

  it('keeps the plain title for an order that entered complete', () => {
    const payload = toTeamsOrderPayload(order(), {
      persistence_status: 'PENDING',
      floxu_code: 'TLQV-1',
      last_error: null,
    });

    expect(firstLine(payload)).toBe('Nueva orden FRAVEGA #20277852 (PENDING)');
    expect(payload.aviso).toBeNull();
    expect(payload.mensaje).not.toContain('Reintentar');
  });

  it('flags an order that entered with incomplete data and explains why', () => {
    const warning =
      'Seller Central no devolvio el detalle de la orden (500): se armo con el listado + VTEX, sin email';
    const payload = toTeamsOrderPayload(order({ warnings: [warning] }), {
      persistence_status: 'PENDING',
      last_error: null,
    });

    expect(firstLine(payload)).toBe(
      '⚠️ Nueva orden FRAVEGA #20277852 (PENDING) con datos incompletos',
    );
    expect(payload.mensaje).toContain(`Aviso: ${warning}`);
    expect(payload.aviso).toBe(warning);
  });

  it('makes clear a FAILED order did not enter VBI and how to retry it', () => {
    const payload = toTeamsOrderPayload(
      order({ customer: emptyCustomer(), items: [], amount: null }),
      {
        persistence_status: 'FAILED',
        last_error:
          '[SOURCE_ERROR] seller-central: [FRAVEGA GET] /api/v1/orders/v95020273frvg-01 → 500',
      },
    );

    expect(firstLine(payload)).toBe(
      '🔴 Orden FRAVEGA #20277852 NO entro a VBI (FAILED)',
    );
    expect(payload.mensaje).toContain(
      'Error: [SOURCE_ERROR] seller-central: [FRAVEGA GET] /api/v1/orders/v95020273frvg-01 → 500',
    );
    expect(payload.mensaje).toContain(
      'Reintentar: POST /orders/fravega/retry/v95020273frvg-01',
    );
    expect(payload.estado).toBe('FAILED');
  });
});
