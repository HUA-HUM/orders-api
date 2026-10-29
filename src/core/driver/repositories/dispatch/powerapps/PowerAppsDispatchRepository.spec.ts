import { PowerAppsDispatchRepository } from './PowerAppsDispatchRepository';
import {
  emptyCustomer,
  emptyShipping,
} from '../../../../entitis/orders/Orders';
import type { NormalizedOrder } from '../../../../entitis/orders/Orders';

describe('PowerAppsDispatchRepository', () => {
  const order: NormalizedOrder = {
    marketplace: 'fravega',
    orderId: '19836023',
    suborderId: 'v93713051frvg-01',
    createdAt: '2026-10-03T01:27:38.512Z',
    amount: 1103000,
    latestStatus: 'Created',
    customer: emptyCustomer(),
    shipping: emptyShipping(),
    items: [],
    raw: {},
  };

  const originalUrl = process.env.POWERAPPS_API_URL;
  let fetchMock: jest.SpyInstance;

  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  beforeEach(() => {
    // URL ficticia: fetch esta mockeado, nunca se llama a VBI
    process.env.POWERAPPS_API_URL = 'http://vbi.test/api/external-sale-create';
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env.POWERAPPS_API_URL = originalUrl;
  });

  it('sends an empty processId and returns the VBI sale numbers', async () => {
    respond(200, {
      status: 'success',
      action: 'created',
      saleId: 345,
      nroVenta: 25,
      tlqtNumber: 'TLQV-36120',
    });

    const result = await new PowerAppsDispatchRepository().createSale(order);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { processId: string };
    expect(body.processId).toBe('');
    expect(result).toEqual({
      ok: true,
      saleId: '345',
      nroVenta: '25',
      tlqtNumber: 'TLQV-36120',
    });
  });

  it('fails when a 2xx response does not say status success', async () => {
    respond(200, { saleId: 345 });

    await expect(
      new PowerAppsDispatchRepository().createSale(order),
    ).rejects.toThrow('PowerApps respondio 200');
  });

  it('fails when VBI answers 200 with status error', async () => {
    respond(200, { status: 'error', message: 'CUIT invalido' });

    await expect(
      new PowerAppsDispatchRepository().createSale(order),
    ).rejects.toThrow('PowerApps respondio 200');
  });

  it('fails on a non 2xx response', async () => {
    respond(500, { message: 'boom' });

    await expect(
      new PowerAppsDispatchRepository().createSale(order),
    ).rejects.toThrow('PowerApps respondio 500');
  });

  it('fails without calling VBI when the url is not configured', async () => {
    process.env.POWERAPPS_API_URL = '';

    await expect(
      new PowerAppsDispatchRepository().createSale(order),
    ).rejects.toThrow('POWERAPPS_API_URL no configurado');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
