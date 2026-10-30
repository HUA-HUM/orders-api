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
      duplicate: false,
      saleId: '345',
      nroVenta: '25',
      tlqtNumber: 'TLQV-36120',
    });
  });

  it('accepts a duplicate NROVENTA as already sent and returns the existing sale', async () => {
    // Respuesta real de VBI al reenviar una venta (30/10)
    respond(200, {
      status: 'duplicate',
      action: 'duplicate',
      reason: 'NROVENTA_ALREADY_EXISTS',
      saleId: '17c6d931-5bd4-f111-84ea-70a8a59b66be',
      nroVenta: '19836023',
      tlqtNumber: 'TLQV-22733',
    });

    const result = await new PowerAppsDispatchRepository().createSale(order);

    expect(result).toEqual({
      ok: true,
      duplicate: true,
      saleId: '17c6d931-5bd4-f111-84ea-70a8a59b66be',
      nroVenta: '19836023',
      tlqtNumber: 'TLQV-22733',
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
