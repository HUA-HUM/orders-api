import type { FravegaVtexOrderResponse } from '../../../entitis/marketplace-api/fravega/orders/GetFravegaVtexOrdersResponse';
import type {
  NormalizedOrderCustomer,
  NormalizedOrderItem,
  NormalizedOrderShipping,
} from '../../../entitis/orders/Orders';
import {
  joinName,
  joinParts,
  toStringOrNull,
  trimOrNull,
} from './fieldHelpers';

export interface VtexEnrichment {
  customer: Partial<NormalizedOrderCustomer>;
  shipping: Partial<NormalizedOrderShipping>;
  items: NormalizedOrderItem[];
}

export function vtexOrderToNormalized(
  detail: FravegaVtexOrderResponse,
): VtexEnrichment {
  const c = detail.clientProfileData;
  const address = detail.shippingData?.address;

  return {
    customer: {
      name: joinName(c?.firstName, c?.lastName),
      document: toStringOrNull(c?.document),
      phone: toStringOrNull(c?.phone),
      email: trimOrNull(c?.email),
    },
    shipping: {
      address: joinParts(address?.street, address?.number, address?.complement),
      city: trimOrNull(address?.city),
      province: trimOrNull(address?.state),
      zipCode: toStringOrNull(address?.postalCode),
    },
    items: (detail.items ?? []).map((item) => ({
      sku: toStringOrNull(item.refId),
      sellerSku: toStringOrNull(item.sellerSku),
      name: trimOrNull(item.name),
      quantity: typeof item.quantity === 'number' ? item.quantity : null,
    })),
  };
}
