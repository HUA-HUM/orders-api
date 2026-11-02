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
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TeamsNotificationRepository.TIMEOUT_MS),
    });

    // Power Automate responde 202 Accepted al disparar el flujo
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Teams respondio ${response.status}: ${text.slice(0, 300)}`,
      );
    }
  }
}
