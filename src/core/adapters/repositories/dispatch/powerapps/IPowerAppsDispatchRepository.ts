import type { NormalizedOrder } from '../../../../entitis/orders/Orders';

export const I_POWERAPPS_DISPATCH_REPOSITORY = Symbol(
  'I_POWERAPPS_DISPATCH_REPOSITORY',
);

export interface PowerAppsDispatchResult {
  ok: boolean;
  // VBI ya tenia una venta con ese NROVENTA: no creo otra y devolvio la existente
  duplicate: boolean;
  saleId: string | null;
  // VBI devuelve el mismo NROVENTA que enviamos (orderId de Seller Central)
  nroVenta: string | null;
  // Numero TLQV (TLQV-...): se guarda en floxu_code de madre. VBI lo asigna despues
  // de crear la venta, asi que en el primer envio suele venir null
  tlqtNumber: string | null;
}

export interface IPowerAppsDispatchRepository {
  createSale(order: NormalizedOrder): Promise<PowerAppsDispatchResult>;
}
