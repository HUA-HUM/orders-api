import type { NormalizedOrder } from '../../../../entitis/orders/Orders';

export const I_POWERAPPS_DISPATCH_REPOSITORY = Symbol(
  'I_POWERAPPS_DISPATCH_REPOSITORY',
);

export interface PowerAppsDispatchResult {
  ok: boolean;
  saleId: string | null;
  // Numero de venta propio de VBI (no el NROVENTA que enviamos)
  nroVenta: string | null;
  // Numero TLQV asignado a la venta (TLQV-...): se guarda en floxu_code de madre
  tlqtNumber: string | null;
}

export interface IPowerAppsDispatchRepository {
  createSale(order: NormalizedOrder): Promise<PowerAppsDispatchResult>;
}
