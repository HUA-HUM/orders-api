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

  it('maps a megatone order with megatone:{id} unique_key and null suborder', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result).toMatchObject({
      marketplace: 'megatone',
      external_order_id: '5453445',
      external_suborder_id: null,
      unique_key: 'megatone:5453445',
      customer_email: null,
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

  it('maps a fravega order with suborderId + email (fravega:{suborderId})', () => {
    const result = toNormalizedOrderRequest({
      marketplace: 'fravega',
      orderId: '18521376',
      suborderId: 'v90520163frvg-01',
      email: 'jeismara@example.com',
      createdAt: '2026-02-03T14:00:00.000Z',
      amount: 563759,
      customerName: 'Jeismara Salcedo',
      latestStatus: 'Created',
      raw: { orderId: 18521376, suborderId: 'v90520163frvg-01' },
    });

    expect(result.unique_key).toBe('fravega:v90520163frvg-01');
    expect(result.external_suborder_id).toBe('v90520163frvg-01');
    expect(result.customer_email).toBe('jeismara@example.com');
  });

  it('passes the raw marketplace payload through as source_payload', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result.source_payload).toEqual({
      IdOrden: 5453445,
      Estado: [{ Descripcion: 'Anulado' }],
    });
  });

  it('leaves still-pending fields null (phone/document/items → enriquecimiento futuro)', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result.customer_phone).toBeNull();
    expect(result.customer_document).toBeNull();
    expect(result.items_quantity).toBeNull();
  });

  it('wraps a non-object raw so source_payload is always an object', () => {
    const result = toNormalizedOrderRequest({ ...megatoneOrder, raw: 'oops' });

    expect(result.source_payload).toEqual({ raw: 'oops' });
  });
});
