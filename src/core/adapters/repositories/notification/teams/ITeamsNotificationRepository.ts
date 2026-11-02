export const I_TEAMS_NOTIFICATION_REPOSITORY = Symbol(
  'I_TEAMS_NOTIFICATION_REPOSITORY',
);

export interface ITeamsNotificationRepository {
  /* Postea la orden al flujo de Power Automate que la publica en el canal de Teams */
  notifyOrder(payload: Record<string, unknown>): Promise<void>;
}
