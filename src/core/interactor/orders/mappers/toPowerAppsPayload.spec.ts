import { toPowerAppsPayload } from './toPowerAppsPayload';
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

describe('toPowerAppsPayload', () => {
  it('builds the PowerApps data body with DD/MM/YYYY dates and ESTADO', () => {
    const data = toPowerAppsPayload(order);

    expect(data).toMatchObject({
      NROVENTA: 'FVG-v90520163frvg-01',
      FECHAVENTA: '12/05/2026',
      FECHAENTREGA: '02/06/2026',
      LINKAMAZON: 'https://www.amazon.com/dp/B0FGYGBY3C',
      SKU: 'B0FGYGBY3C',
      NOMBREPRODUCTO: 'Tablet Lenovo',
      ESTADO: 'Created',
      TIPOVENTA: 'FRAVEGA',
      CUITCOMPRADOR: '27253275877',
      TELEFONO: '(261) 656-2613',
    });
  });
});
