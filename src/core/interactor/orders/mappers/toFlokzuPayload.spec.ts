import { toFlokzuPayload } from './toFlokzuPayload';
import type { NormalizedOrder } from '../../../entitis/orders/Orders';

const order: NormalizedOrder = {
  marketplace: 'fravega',
  orderId: 'FVG-v90520163frvg-01',
  suborderId: 'v90520163frvg-01',
  createdAt: '2026-05-12T15:20:43.000Z',
  amount: 690399,
  latestStatus: 'Created',
  customer: {
    name: 'Gabriela Hidalgo',
    document: '27253275877',
    phone: '(261) 656-2613',
    email: 'hidalgogabriela92@gmail.com',
  },
  shipping: {
    address: 'Pedraza 990',
    city: 'El Plumerillo',
    province: 'Mendoza',
    zipCode: '5539',
    estimatedDeliveryDate: '2026-06-02T00:00:00.000Z',
  },
  items: [
    { sku: 'B0FGYGBY3C', sellerSku: '123', name: 'Tablet Lenovo', quantity: 1 },
  ],
  raw: {},
};

describe('toFlokzuPayload', () => {
  it('builds the Flokzu data body with YYYY/MM/DD dates and amazon link from sku', () => {
    const data = toFlokzuPayload(order);

    expect(data).toMatchObject({
      NROVENTA: 'FVG-v90520163frvg-01',
      FECHAVENTA: '2026/05/12',
      CUITCOMPRADOR: '27253275877',
      NOMBREDESTINATARIO: 'Gabriela Hidalgo',
      OBSOPERACIONES: 'v90520163frvg-01',
      PRECIOVENTA: 690399,
      NOMBREPRODUCTO: 'Tablet Lenovo',
      'Cantidad de Unidades': 1,
      FECHAENTREGA: '2026/06/02',
      EMAIL: 'hidalgogabriela92@gmail.com',
      TIPOVENTA: 'FRAVEGA',
      SKU: 'B0FGYGBY3C',
      LINKAMAZON: 'https://www.amazon.com/dp/B0FGYGBY3C',
      TELEFONO: '(261) 656-2613',
      'ENVIO DOMESTICO': 'ENVIOPACK',
    });
  });

  it('leaves missing fields empty and no amazon link without sku', () => {
    const data = toFlokzuPayload({
      ...order,
      customer: { name: null, document: null, phone: null, email: null },
      items: [],
    });

    expect(data.CUITCOMPRADOR).toBe('');
    expect(data.TELEFONO).toBe('');
    expect(data.SKU).toBe('');
    expect(data.LINKAMAZON).toBe('');
  });
});
