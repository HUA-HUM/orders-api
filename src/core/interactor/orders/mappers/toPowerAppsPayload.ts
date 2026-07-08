import type { NormalizedOrder } from '../../../entitis/orders/Orders';
import { formatDateDmy } from './fieldHelpers';

export function toPowerAppsPayload(
  order: NormalizedOrder,
): Record<string, string | number> {
  const item = order.items[0];
  const sku = item?.sku ?? '';

  return {
    NROVENTA: order.orderId,
    FECHAVENTA: formatDateDmy(order.createdAt),
    FECHAENTREGA: formatDateDmy(order.shipping.estimatedDeliveryDate),
    LINKAMAZON: sku ? `https://www.amazon.com/dp/${sku}` : '',
    SKU: sku,
    NOMBREPRODUCTO: item?.name ?? '',
    ESTADO: order.latestStatus ?? '',
    'Cantidad de Unidades': item?.quantity ?? '',
    TIPOVENTA: order.marketplace.toUpperCase(),
    PRECIOVENTA: order.amount ?? '',
    CUITCOMPRADOR: order.customer.document ?? '',
    NOMBREDESTINATARIO: order.customer.name ?? '',
    'Datos Cliente': order.shipping.address ?? '',
    TELEFONO: order.customer.phone ?? '',
    EMAIL: order.customer.email ?? '',
    CIUDAD: order.shipping.city ?? '',
    PROVINCIA: order.shipping.province ?? '',
    'CODIGO POSTAL': order.shipping.zipCode ?? '',
  };
}
