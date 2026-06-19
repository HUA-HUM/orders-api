import { OrdersPersistenceRepository } from './OrdersPersistenceRepository';
import type { MadreHttpClient } from '../http/MadreHttpClient';
import type { NormalizedOrder } from '../../../../entitis/orders/Orders';

describe('OrdersPersistenceRepository', () => {
  let http: { get: jest.Mock; post: jest.Mock; patch: jest.Mock };
  let repository: OrdersPersistenceRepository;

  const order: NormalizedOrder = {
    marketplace: 'megatone',
    orderId: '5453445',
    createdAt: '2026-05-10T11:02:00.000Z',
    amount: 284999,
    customerName: 'Joel Francisco Ordoñez',
    latestStatus: 'Anulado',
    raw: { IdOrden: 5453445 },
  };

  beforeEach(() => {
    http = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
    };
    repository = new OrdersPersistenceRepository(
      http as unknown as MadreHttpClient,
    );
  });

  it('insert posts a mapped batch to /api/orders/batch', async () => {
    http.post.mockResolvedValueOnce({
      status: 'ok',
      total: 1,
      inserted: 1,
      skipped: 0,
    });

    const result = await repository.insert([order]);

    expect(http.post).toHaveBeenCalledWith('/api/orders/batch', {
      orders: [expect.objectContaining({ unique_key: 'megatone:5453445' })],
    });
    expect(result.inserted).toBe(1);
  });

  it('splits large batches into chunks so madre never gets an oversized body', async () => {
    const orders: NormalizedOrder[] = Array.from({ length: 60 }, (_, i) => ({
      ...order,
      orderId: String(1000 + i),
      raw: { IdOrden: 1000 + i },
    }));
    http.post.mockImplementation((_path: string, body: { orders: unknown[] }) =>
      Promise.resolve({
        status: 'ok',
        total: body.orders.length,
        inserted: body.orders.length,
        skipped: 0,
      }),
    );

    const result = await repository.insert(orders);

    expect(http.post).toHaveBeenCalledTimes(3);
    for (const call of http.post.mock.calls) {
      expect(call[1].orders.length).toBeLessThanOrEqual(25);
    }
    expect(result.total).toBe(60);
    expect(result.inserted).toBe(60);
    expect(result.skipped).toBe(0);
  });

  it('findByUniqueKey url-encodes the colon in the unique_key', async () => {
    http.get.mockResolvedValueOnce({ exists: false, order: null });

    await repository.findByUniqueKey('megatone:5453445');

    expect(http.get).toHaveBeenCalledWith('/api/orders/megatone%3A5453445');
  });

  it('updateStatus patches /api/orders/:id/status with the payload', async () => {
    http.patch.mockResolvedValueOnce({ status: 'ok' });

    await repository.updateStatus(13, { persistence_status: 'PROCESSED_FLOXU' });

    expect(http.patch).toHaveBeenCalledWith('/api/orders/13/status', {
      persistence_status: 'PROCESSED_FLOXU',
    });
  });

  it('logs and rethrows when madre returns an error', async () => {
    const error = new Error('boom');
    http.post.mockRejectedValueOnce(error);

    await expect(repository.insert([order])).rejects.toBe(error);
  });
});
