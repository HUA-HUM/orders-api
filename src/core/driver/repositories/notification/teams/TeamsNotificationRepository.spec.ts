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

  it('posts an Adaptive Card message to the Power Automate URL', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    await new TeamsNotificationRepository().notifyOrder({
      orderId: '1',
      mensaje: 'Nueva orden FRAVEGA #1 (PENDING)\nCliente: Juan\nMonto: $100',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://teams.test/invoke?sig=abc');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as ReturnType<
      typeof TeamsNotificationRepository.toCardMessage
    >;
    expect(body.type).toBe('message');
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].contentType).toBe(
      'application/vnd.microsoft.card.adaptive',
    );
    const card = body.attachments[0].content;
    expect(card.type).toBe('AdaptiveCard');
    expect(card.body.map((b) => b.text)).toEqual([
      'Nueva orden FRAVEGA #1 (PENDING)',
      'Cliente: Juan',
      'Monto: $100',
    ]);
    expect(card.body[0].weight).toBe('Bolder');
  });

  it('falls back to the raw payload when there is no mensaje', () => {
    const card = TeamsNotificationRepository.toCardMessage({ orderId: '1' })
      .attachments[0].content;

    expect(card.body).toHaveLength(1);
    expect(card.body[0].text).toBe('{"orderId":"1"}');
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
