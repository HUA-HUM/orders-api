import type { NormalizedOrder } from '../../../../entitis/orders/Orders';

export const I_FLOKZU_DISPATCH_REPOSITORY = Symbol(
  'I_FLOKZU_DISPATCH_REPOSITORY',
);

export interface FlokzuDispatchResult {
  identifier: string;
}

export interface IFlokzuDispatchRepository {
  createInstance(order: NormalizedOrder): Promise<FlokzuDispatchResult>;
}
