import { toNormalizedOrderRequest } from './toNormalizedOrderRequest';
import {
  emptyCustomer,
  emptyShipping,
  type NormalizedOrder,
} from '../../../../../entitis/orders/Orders';

describe('toNormalizedOrderRequest', () => {
  const megatoneOrder: NormalizedOrder = {
    marketplace: 'megatone',
    orderId: '5453445',
    createdAt: '2026-05-10T11:02:00.000Z',
    amount: 284999,
    latestStatus: 'Anulado',
    customer: { ...emptyCustomer(), name: 'Joel Francisco Ordoñez' },
    shipping: emptyShipping(),
    items: [],
    raw: { IdOrden: 5453445, Estado: [{ Descripcion: 'Anulado' }] },
  };

  it('maps a megatone order with megatone:{id} unique_key and null suborder', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result).toMatchObject({
      marketplace: 'megatone',
      external_order_id: '5453445',
      external_suborder_id: null,
      unique_key: 'megatone:5453445',
      customer_name: 'Joel Francisco Ordoñez',
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

  it('maps an enriched fravega order (customer + shipping → typed columns)', () => {
    const result = toNormalizedOrderRequest({
      marketplace: 'fravega',
      orderId: '18521376',
      suborderId: 'v90520163frvg-01',
      createdAt: '2026-02-03T14:00:00.000Z',
      amount: 563759,
      latestStatus: 'Created',
      customer: {
        name: 'Jeismara Salcedo',
        document: '27253275877',
        phone: '(261) 656-2613',
        email: 'jeismara@example.com',
      },
      shipping: {
        address: 'Pedraza 990 casa 14',
        city: 'El Plumerillo',
        province: 'Mendoza',
        zipCode: '5539',
        estimatedDeliveryDate: '2026-06-02T00:00:00.000Z',
      },
      items: [
        {
          sku: 'B0BX4T243L',
          sellerSku: '32790631',
          name: 'Afeitadora',
          quantity: 2,
        },
      ],
      raw: { orderId: 18521376, suborderId: 'v90520163frvg-01' },
    });

    expect(result.unique_key).toBe('fravega:v90520163frvg-01');
    expect(result.external_suborder_id).toBe('v90520163frvg-01');
    expect(result.customer_name).toBe('Jeismara Salcedo');
    expect(result.customer_document).toBe('27253275877');
    expect(result.customer_phone).toBe('(261) 656-2613');
    expect(result.customer_email).toBe('jeismara@example.com');
    expect(result.shipping_address).toBe('Pedraza 990 casa 14');
    expect(result.shipping_city).toBe('El Plumerillo');
    expect(result.shipping_province).toBe('Mendoza');
    expect(result.shipping_zip_code).toBe('5539');
    expect(result.estimated_delivery_date).toBe('2026-06-02T00:00:00.000Z');
    expect(result.items_quantity).toBe(2);
  });

  it('preserves the full canonical order (incl. delivery date) in normalized_payload', () => {
    const result = toNormalizedOrderRequest({
      ...megatoneOrder,
      shipping: {
        ...emptyShipping(),
        estimatedDeliveryDate: '2026-06-02T00:00:00.000Z',
      },
    });

    expect(result.normalized_payload).toMatchObject({
      customer: { name: 'Joel Francisco Ordoñez' },
      shipping: { estimatedDeliveryDate: '2026-06-02T00:00:00.000Z' },
    });
  });

  it('passes the raw marketplace payload through as source_payload', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result.source_payload).toEqual({
      IdOrden: 5453445,
      Estado: [{ Descripcion: 'Anulado' }],
    });
  });

  it('leaves null whatever the source did not provide (megatone sin enriquecer)', () => {
    const result = toNormalizedOrderRequest(megatoneOrder);

    expect(result.customer_phone).toBeNull();
    expect(result.customer_document).toBeNull();
    expect(result.customer_email).toBeNull();
    expect(result.items_quantity).toBeNull();
  });

  it('wraps a non-object raw so source_payload is always an object', () => {
    const result = toNormalizedOrderRequest({ ...megatoneOrder, raw: 'oops' });

    expect(result.source_payload).toEqual({ raw: 'oops' });
  });
});
