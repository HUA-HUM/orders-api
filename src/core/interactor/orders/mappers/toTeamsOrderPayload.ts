import type { NormalizedOrder } from '../../../entitis/orders/Orders';
import type { OrderProcessingFields } from '../../../entitis/madre-api/orders/NormalizedOrderRequest';
import { formatDateDmyArgentina } from './fieldHelpers';

/**
 * Body para el flujo de Power Automate que publica la orden en Teams.
 * Campos planos para mapearlos en el flujo, y `mensaje` con el texto ya armado
 * por si el flujo solo postea un string (la primera linea es el titulo de la card).
 */
export function toTeamsOrderPayload(
  order: NormalizedOrder,
  processing: OrderProcessingFields,
): Record<string, string | number | null> {
  const item = order.items[0];
  const estado = processing.persistence_status ?? 'PENDING';
  const fecha = formatDateDmyArgentina(order.createdAt);
  const monto = order.productsAmount ?? order.amount;
  const warnings = order.warnings ?? [];

  const lines = [
    title(order, estado, warnings),
    fecha && `Fecha: ${fecha}`,
    order.customer.name && `Cliente: ${order.customer.name}`,
    item?.name &&
      `Producto: ${item.name}${item.quantity ? ` x${item.quantity}` : ''}`,
    monto !== null && monto !== undefined && `Monto: $${monto}`,
    processing.floxu_code && `TLQV: ${processing.floxu_code}`,
    processing.last_error && `Error: ${processing.last_error}`,
    ...warnings.map((warning) => `Aviso: ${warning}`),
    estado === 'FAILED' &&
      order.suborderId &&
      `Reintentar: POST /orders/fravega/retry/${order.suborderId}`,
  ].filter(Boolean);

  return {
    marketplace: order.marketplace,
    orderId: order.orderId,
    suborderId: order.suborderId ?? null,
    fecha,
    estado,
    estadoMarketplace: order.latestStatus,
    cliente: order.customer.name,
    producto: item?.name ?? null,
    sku: item?.sku ?? null,
    cantidad: item?.quantity ?? null,
    monto: monto ?? null,
    tlqv: processing.floxu_code ?? null,
    error: processing.last_error ?? null,
    aviso: warnings.length ? warnings.join(' | ') : null,
    mensaje: lines.join('\n'),
  };
}

/* El titulo distingue a simple vista las ordenes que no entraron o entraron incompletas */
function title(
  order: NormalizedOrder,
  estado: string,
  warnings: string[],
): string {
  const ref = `${order.marketplace.toUpperCase()} #${order.orderId}`;

  if (estado === 'FAILED') {
    return `🔴 Orden ${ref} NO entro a VBI (FAILED)`;
  }
  if (warnings.length > 0) {
    return `⚠️ Nueva orden ${ref} (${estado}) con datos incompletos`;
  }
  return `Nueva orden ${ref} (${estado})`;
}
