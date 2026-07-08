import type { NormalizedOrder } from '../../../entitis/orders/Orders';
import { formatDateYmd } from './fieldHelpers';

export function toFlokzuPayload(
  order: NormalizedOrder,
): Record<string, string | number> {
  const item = order.items[0];
  const sku = item?.sku ?? '';

  return {
    NROVENTA: order.orderId,
    FECHAVENTA: formatDateYmd(order.createdAt),
    CUITCOMPRADOR: order.customer.document ?? '',
    NOMBREDESTINATARIO: order.customer.name ?? '',
    OBSOPERACIONES: order.suborderId ?? '',
    PRECIOVENTA: order.amount ?? '',
    NOMBREPRODUCTO: item?.name ?? '',
    'Cantidad de Unidades': item?.quantity ?? '',
    FECHAENTREGA: formatDateYmd(order.shipping.estimatedDeliveryDate),
    'Datos Cliente': order.shipping.address ?? '',
    CIUDAD: order.shipping.city ?? '',
    PROVINCIA: order.shipping.province ?? '',
    'CODIGO POSTAL': order.shipping.zipCode ?? '',
    EMAIL: order.customer.email ?? '',
    TIPOVENTA: order.marketplace.toUpperCase(),
    SKU: sku,
    LINKAMAZON: sku ? `https://www.amazon.com/dp/${sku}` : '',
    TELEFONO: order.customer.phone ?? '',
    'ENVIO DOMESTICO': 'ENVIOPACK',
  };
}
