import type { NormalizedOrder } from '../../../entitis/orders/Orders';
import {
  formatDateDmy,
  formatDateDmyArgentina,
  joinParts,
} from './fieldHelpers';

export function toPowerAppsPayload(
  order: NormalizedOrder,
): Record<string, string | number> {
  const item = order.items[0];
  const sku = item?.sku ?? '';

  return {
    NROVENTA: order.orderId,
    FECHAVENTA: formatDateDmyArgentina(order.createdAt),
    // Fravega manda la fecha de entrega sin hora (00:00 UTC): en hora argentina caeria un dia antes
    FECHAENTREGA: formatDateDmy(order.shipping.estimatedDeliveryDate),
    LINKAMAZON: sku ? `https://www.amazon.com/dp/${sku}` : '',
    SKU: sku,
    NOMBREPRODUCTO: item?.name ?? '',
    ESTADO: order.latestStatus ?? '',
    'Cantidad de Unidades': item?.quantity ?? '',
    TIPOVENTA: order.marketplace.toUpperCase(),
    PRECIOVENTA: order.productsAmount ?? order.amount ?? '',
    CUITCOMPRADOR: order.customer.document ?? '',
    NOMBREDESTINATARIO: order.customer.name ?? '',
    'Datos Cliente':
      joinParts(order.shipping.address, order.shipping.receiverName) ?? '',
    TELEFONO: order.customer.phone ?? '',
    EMAIL: order.customer.email ?? '',
    CIUDAD: order.shipping.city ?? '',
    PROVINCIA: order.shipping.province ?? '',
    'CODIGO POSTAL': order.shipping.zipCode ?? '',
  };
}
