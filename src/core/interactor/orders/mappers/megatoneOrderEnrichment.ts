import type { GetMegatoneOrdersResponse } from '../../../entitis/marketplace-api/megatone/orders/GetMegatoneOrdersResponse';
import type {
  NormalizedOrderCustomer,
  NormalizedOrderShipping,
} from '../../../entitis/orders/Orders';
import {
  joinParts,
  normalizePhone,
  toStringOrNull,
  trimOrNull,
} from './fieldHelpers';

export interface MegatoneEnrichment {
  customer: Partial<NormalizedOrderCustomer>;
  shipping: Partial<NormalizedOrderShipping>;
}

export function extractMegatoneEnrichment(
  order: GetMegatoneOrdersResponse,
): MegatoneEnrichment {
  const c = order.Cliente;

  return {
    customer: {
      document: toStringOrNull(c?.NumeroCuit) ?? toStringOrNull(c?.Documento),
      phone: normalizePhone(c?.Telefono),
      email: trimOrNull(c?.Email),
    },
    shipping: {
      address: joinParts(c?.Calle, c?.Numero, c?.Piso),
      city: trimOrNull(c?.Localidad),
      province: trimOrNull(c?.Provincia),
      zipCode: toStringOrNull(c?.CodigoPostal),
    },
  };
}
