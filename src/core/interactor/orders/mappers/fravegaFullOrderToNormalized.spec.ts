import { fravegaFullOrderToNormalized } from './fravegaFullOrderToNormalized';

describe('fravegaFullOrderToNormalized', () => {
  it('maps the Seller Central buyer and the VTEX items of a full order', () => {
    const order = fravegaFullOrderToNormalized({
      orderId: 19836023,
      suborderId: 'v93713051frvg-01',
      status: { sellerCentral: 'Created', vtex: 'ready-for-handling' },
      purchaseDate: '2026-10-03T01:27:38.5128827+00:00',
      estimatedDeliveryDate: '2026-10-24T00:00:00+00:00',
      buyer: {
        fullName: 'Gabriela Hidalgo',
        cuil: '27253275877',
        email: 'g@example.com',
        phone: '+5491100000000',
      },
      shipping: {
        receiverName: 'Juan Perez',
        street: 'hipolito yrigoyen',
        number: '2032',
        floor: 'Porton azul',
        apartment: null,
        city: 'Caleta Olivia',
        state: 'SANTA CRUZ',
        zipCode: '9011',
      },
      items: [
        {
          asin: 'B0DCNMTYKS',
          vtexSkuId: '32797490',
          name: 'Alforja',
          quantity: 2,
        },
      ],
      totals: { products: 1093000, total: 1103000 },
    });

    expect(order).toMatchObject({
      marketplace: 'fravega',
      orderId: '19836023',
      suborderId: 'v93713051frvg-01',
      createdAt: '2026-10-03T01:27:38.512Z',
      amount: 1103000,
      productsAmount: 1093000,
      latestStatus: 'Created',
      customer: {
        name: 'Gabriela Hidalgo',
        document: '27253275877',
        phone: '+5491100000000',
        email: 'g@example.com',
      },
      shipping: {
        address: 'hipolito yrigoyen 2032 Porton azul',
        receiverName: 'Juan Perez',
        city: 'Caleta Olivia',
        province: 'SANTA CRUZ',
        zipCode: '9011',
        estimatedDeliveryDate: '2026-10-24T00:00:00.000Z',
      },
      items: [
        {
          sku: 'B0DCNMTYKS',
          sellerSku: '32797490',
          name: 'Alforja',
          quantity: 2,
        },
      ],
    });
  });

  it('leaves the document empty when Seller Central has no cuil', () => {
    const order = fravegaFullOrderToNormalized({
      orderId: 1,
      suborderId: 'v1frvg-01',
      buyer: { cuil: '' },
    });

    expect(order.customer.document).toBeNull();
    expect(order.items).toEqual([]);
    expect(order.amount).toBeNull();
  });
});
