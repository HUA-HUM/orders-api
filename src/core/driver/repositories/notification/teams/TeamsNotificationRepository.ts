import { Injectable, Logger } from '@nestjs/common';
import type { ITeamsNotificationRepository } from '../../../../adapters/repositories/notification/teams/ITeamsNotificationRepository';

@Injectable()
export class TeamsNotificationRepository implements ITeamsNotificationRepository {
  private static readonly TIMEOUT_MS = 10000;
  private readonly logger = new Logger(TeamsNotificationRepository.name);

  async notifyOrder(payload: Record<string, unknown>): Promise<void> {
    // Se lee en cada envio (no al construir) para poder activarlo sin tocar el codigo
    const url = process.env.TEAMS_WEBHOOK_URL ?? '';

    // Opcional: sin URL no se notifica y el resto del proceso sigue igual
    if (!url) {
      this.logger.debug('TEAMS_WEBHOOK_URL no configurado: no se notifica');
      return;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TeamsNotificationRepository.toCardMessage(payload)),
      signal: AbortSignal.timeout(TeamsNotificationRepository.TIMEOUT_MS),
    });

    // Power Automate responde 202 Accepted al disparar el flujo.
    // Ojo: el 202 no garantiza que el post en Teams haya salido bien (eso se ve en el historial del flujo)
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Teams respondio ${response.status}: ${text.slice(0, 300)}`,
      );
    }
  }

  /**
   * El flujo de Teams ("Post to a channel when a webhook request is received")
   * espera un `message` con un Adaptive Card en `attachments`; si no, el flujo
   * acepta el request (202) pero no publica nada.
   * Se arma la card con `mensaje`: la primera linea es el titulo, el resto el detalle.
   */
  static toCardMessage(payload: Record<string, unknown>) {
    const mensaje =
      typeof payload.mensaje === 'string' && payload.mensaje
        ? payload.mensaje
        : JSON.stringify(payload);
    const [title, ...details] = mensaje.split('\n');

    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.2',
            body: [
              {
                type: 'TextBlock',
                text: title,
                size: 'Medium',
                weight: 'Bolder',
                wrap: true,
              },
              ...details.map((text) => ({
                type: 'TextBlock',
                text,
                wrap: true,
                spacing: 'None',
              })),
            ],
          },
        },
      ],
    };
  }
}
