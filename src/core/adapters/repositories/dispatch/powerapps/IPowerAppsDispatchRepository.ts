import type { NormalizedOrder } from '../../../../entitis/orders/Orders';

export const I_POWERAPPS_DISPATCH_REPOSITORY = Symbol(
  'I_POWERAPPS_DISPATCH_REPOSITORY',
);

export interface PowerAppsDispatchResult {
  ok: boolean;
}

export interface IPowerAppsDispatchRepository {
  createSale(
    order: NormalizedOrder,
    processId: string,
  ): Promise<PowerAppsDispatchResult>;
}
