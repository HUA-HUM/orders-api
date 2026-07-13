import { vtexOrderToNormalized } from './vtexOrderToNormalized';

describe('vtexOrderToNormalized', () => {
  it('extracts customer (incl. phone), shipping and items (refId as sku/ASIN)', () => {
    const enrichment = vtexOrderToNormalized({
      clientProfileData: {
        firstName: 'Martin',
        lastName: 'Casanova',
        documentType: 'dni',
        document: '37790575',
        phone: '+541140733724',
        email: 'masked@ct.vtex.com.br',
      },
      items: [
        {
          id: '32790631',
          refId: 'B0BX4T243L',
          sellerSku: '32790631',
          name: 'Afeitadora Babylisspro',
          quantity: 1,
        },
      ],
      shippingData: {
        address: {
          street: '3 de febrero',
          number: '2411',
          complement: 'Llamar cuando este afuera',
          postalCode: '1888',
          city: 'Florencio Varela',
          state: 'BUENOS AIRES',
        },
      },
    });

    expect(enrichment.customer).toEqual({
      name: 'Martin Casanova',
      document: '37790575',
      phone: '+541140733724',
      email: 'masked@ct.vtex.com.br',
    });
    expect(enrichment.shipping).toEqual({
      address: '3 de febrero 2411 Llamar cuando este afuera',
      city: 'Florencio Varela',
      province: 'BUENOS AIRES',
      zipCode: '1888',
    });
    expect(enrichment.items).toEqual([
      {
        sku: 'B0BX4T243L',
        sellerSku: '32790631',
        name: 'Afeitadora Babylisspro',
        quantity: 1,
      },
    ]);
  });

  it('returns nulls and empty items when the order is empty', () => {
    const enrichment = vtexOrderToNormalized({});

    expect(enrichment.customer).toEqual({
      name: null,
      document: null,
      phone: null,
      email: null,
    });
    expect(enrichment.items).toEqual([]);
  });
});
