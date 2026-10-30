import { Injectable } from '@nestjs/common';
import type {
  FravegaFullOrdersQuery,
  IGetFravegaOrdersRepository,
} from '../../../../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { GetFravegaVtexOrdersResponse } from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaVtexOrdersResponse';
import type {
  FravegaFullOrderResponse,
  GetFravegaFullOrdersResponse,
} from '../../../../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';
import { MarketplaceHttpClient } from '../../http/MarketplaceHttpClient';

// Argentina es UTC-3 todo el año (sin horario de verano)
const ARGENTINA_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Seller Central compara purchasedatefrom/to contra la hora argentina de la compra, ignorando la zona
 * (probado 30/10: la compra de las 21:50Z, 18:50 en Argentina, solo aparece pidiendo 18:00Z-19:00Z).
 * Se le manda la hora argentina para que el rango pedido en UTC sea el que efectivamente filtra.
 */
export function toSellerCentralDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time)
    ? iso
    : new Date(time - ARGENTINA_OFFSET_MS).toISOString();
}

@Injectable()
export class GetFravegaOrdersRepository implements IGetFravegaOrdersRepository {
  constructor(private readonly http: MarketplaceHttpClient) {}

  async listOrders(
    page: number,
    perPage: number,
  ): Promise<GetFravegaVtexOrdersResponse> {
    return this.http.get<GetFravegaVtexOrdersResponse>('/fravega/vtex/orders', {
      page,
      per_page: perPage,
    });
  }

  // Seller Central + VTEX combinados: email y cuil reales del comprador
  async listFullOrders(
    query: FravegaFullOrdersQuery,
  ): Promise<GetFravegaFullOrdersResponse> {
    return this.http.get<GetFravegaFullOrdersResponse>('/fravega/full-orders', {
      purchasedatefrom: toSellerCentralDate(query.from),
      purchasedateto: toSellerCentralDate(query.to),
      page: query.page,
      'page-size': query.pageSize,
    });
  }

  async getFullOrder(
    suborderId: string,
    orderId: string,
  ): Promise<FravegaFullOrderResponse> {
    return this.http.get<FravegaFullOrderResponse>(
      `/fravega/full-orders/${encodeURIComponent(suborderId)}`,
      { orderid: orderId },
    );
  }
}
