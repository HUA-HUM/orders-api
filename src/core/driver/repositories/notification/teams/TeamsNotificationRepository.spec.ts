import { TeamsNotificationRepository } from './TeamsNotificationRepository';

describe('TeamsNotificationRepository', () => {
  const originalUrl = process.env.TEAMS_WEBHOOK_URL;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    // URL ficticia: fetch esta mockeado, nunca se llama a Power Automate
    process.env.TEAMS_WEBHOOK_URL = 'http://teams.test/invoke?sig=abc';
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env.TEAMS_WEBHOOK_URL = originalUrl;
  });

  it('posts the payload as JSON to the Power Automate URL', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    await new TeamsNotificationRepository().notifyOrder({ orderId: '1' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://teams.test/invoke?sig=abc');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ orderId: '1' });
  });

  it('throws when Power Automate rejects the request', async () => {
    fetchMock.mockResolvedValue(new Response('bad sig', { status: 401 }));

    await expect(
      new TeamsNotificationRepository().notifyOrder({ orderId: '1' }),
    ).rejects.toThrow('Teams respondio 401: bad sig');
  });

  it('does nothing without TEAMS_WEBHOOK_URL', async () => {
    process.env.TEAMS_WEBHOOK_URL = '';

    await new TeamsNotificationRepository().notifyOrder({ orderId: '1' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
