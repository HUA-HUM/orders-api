import { toNormalizedOrderRequest } from './toNormalizedOrderRequest';
import type { NormalizedOrder } from '../../../../../entitis/orders/Orders';

describe('toNormalizedOrderRequest', () => {
  const megatoneOrder: NormalizedOrder = {
    marketplace: 'megatone',
    orderId: '5453445',
    createdAt: '2026-05-10T11:02:00.000Z',
    amount: 284999,
    customerName: 'Joel Francisco Ordoñez',
    latestStatus: 'Anulado',
    raw: { IdOrden: 5453445, Estado: [{ Descripcion: 'Anulado' }] },
  };

  it('maps a megatone order to madre contract with megatone:{id} unique_key', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result).toMatchObject({
      marketplace: 'megatone',
      external_order_id: '5453445',
      external_suborder_id: null,
      unique_key: 'megatone:5453445',
      purchase_date: '2026-05-10T11:02:00.000Z',
      customer_name: 'Joel Francisco Ordoñez',
      amount_total: 284999,
      status: 'Anulado',
      source_schema_version: 'v1',
    });
  });

  it('computes oncity:{id} unique_key and keeps amount raw (no scale normalization)', () => {
    const result = toNormalizedOrderRequest({
      ...megatoneOrder,
      marketplace: 'oncity',
      orderId: '500007',
      amount: 600430020,
      latestStatus: 'Cancelado',
      raw: { IdOrden: 500007, Productos: [], MontoVenta: 600430020 },
    });

    expect(result.unique_key).toBe('oncity:500007');
    expect(result.amount_total).toBe(600430020);
  });

  it('passes the raw marketplace payload through as source_payload', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result.source_payload).toEqual({
      IdOrden: 5453445,
      Estado: [{ Descripcion: 'Anulado' }],
    });
  });

  it('leaves enrichment fields null (deferred to MKT-29)', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result.external_suborder_id).toBeNull();
    expect(result.customer_phone).toBeNull();
    expect(result.customer_email).toBeNull();
    expect(result.customer_document).toBeNull();
    expect(result.items_quantity).toBeNull();
  });

  it('wraps a non-object raw so source_payload is always an object', () => {
    const result = toNormalizedOrderRequest({ ...megatoneOrder, raw: 'oops' });

    expect(result.source_payload).toEqual({ raw: 'oops' });
  });
});
