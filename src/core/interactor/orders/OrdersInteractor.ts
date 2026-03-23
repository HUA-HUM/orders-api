import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { I_GET_FRAVEGA_ORDERS_REPOSITORY } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import { I_GET_MEGATONE_ORDERS_REPOSITORY } from '../../adapters/repositories/marketplace/megatone/orders/IGetMegatoneOrdersRepository';
import { I_GET_ONCITY_ORDERS_REPOSITORY } from '../../adapters/repositories/marketplace/oncity/orders/IGetOncityOrdersRepository';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IGetMegatoneOrdersRepository } from '../../adapters/repositories/marketplace/megatone/orders/IGetMegatoneOrdersRepository';
import type { IGetOncityOrdersRepository } from '../../adapters/repositories/marketplace/oncity/orders/IGetOncityOrdersRepository';
import type { FravegaOrderListItemResponse } from '../../entitis/marketplace-api/fravega/orders/GetFravegaOrdersResponse';
import type { GetMegatoneOrdersResponse } from '../../entitis/marketplace-api/megatone/orders/GetMegatoneOrdersResponse';
import type { GetOncityOrdersResponse } from '../../entitis/marketplace-api/oncity/orders/GetOncityOrdersResponse';
import { SUPPORTED_MARKETPLACES } from '../../entitis/orders/Orders';
import type {
  MarketplaceErrorResponse,
  MarketplaceName,
  MarketplaceOrdersResponse,
  MarketplaceSummary,
  NormalizedOrder,
  OrdersOverviewResponse,
  OrdersQuery,
  OrdersRange,
} from '../../entitis/orders/Orders';
import { MarketplaceHttpError } from '../../driver/repositories/marketplace-api/http/errors/MarketplaceHttpError';

class MarketplaceRequestError extends Error {
  constructor(public readonly details: MarketplaceErrorResponse) {
    super(details.message);
  }
}

@Injectable()
export class OrdersInteractor {
  private static readonly HISTORICAL_START = '2026-01-01T00:00:00.000Z';
  private static readonly FRAVEGA_PAGE_SIZE = 100;
  private static readonly FRAVEGA_MAX_PAGES = 50;
  private static readonly ALLOWED_RECENT_HOURS = [24, 48, 72] as const;

  constructor(
    @Inject(I_GET_MEGATONE_ORDERS_REPOSITORY)
    private readonly megatoneOrdersRepository: IGetMegatoneOrdersRepository,
    @Inject(I_GET_ONCITY_ORDERS_REPOSITORY)
    private readonly oncityOrdersRepository: IGetOncityOrdersRepository,
    @Inject(I_GET_FRAVEGA_ORDERS_REPOSITORY)
    private readonly fravegaOrdersRepository: IGetFravegaOrdersRepository,
  ) {}

  async getMarketplaceOrders(
    marketplace: string,
    query: OrdersQuery,
  ): Promise<MarketplaceOrdersResponse> {
    const normalizedMarketplace = this.parseMarketplace(marketplace);
    const range = this.resolveRange(query);

    try {
      const items = await this.fetchMarketplaceOrders(
        normalizedMarketplace,
        range,
      );

      return {
        marketplace: normalizedMarketplace,
        range,
        total: items.length,
        items,
      };
    } catch (error) {
      const details = this.wrapMarketplaceError(normalizedMarketplace, error);

      throw new BadGatewayException({
        error: `No se pudieron obtener órdenes de ${normalizedMarketplace}.`,
        ...details,
      });
    }
  }

  async getAllMarketplaceOrders(
    query: OrdersQuery,
  ): Promise<OrdersOverviewResponse> {
    const range = this.resolveRange(query);
    return this.buildOverview(range);
  }

  async getLast24HoursOverview(): Promise<OrdersOverviewResponse> {
    return this.getRecentHoursOverview(24);
  }

  async getRecentHoursOverview(hours: number): Promise<OrdersOverviewResponse> {
    this.validateRecentHours(hours);

    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

    return this.buildOverview({
      from: from.toISOString(),
      to: now.toISOString(),
    });
  }

  async getHistoricalOverview(): Promise<OrdersOverviewResponse> {
    return this.buildOverview({
      from: OrdersInteractor.HISTORICAL_START,
      to: new Date().toISOString(),
    });
  }

  private async buildOverview(
    range: OrdersRange,
  ): Promise<OrdersOverviewResponse> {
    const results = await Promise.allSettled(
      SUPPORTED_MARKETPLACES.map(async (marketplace) => {
        try {
          return {
            marketplace,
            items: await this.fetchMarketplaceOrders(marketplace, range),
          };
        } catch (error) {
          throw new MarketplaceRequestError(
            this.wrapMarketplaceError(marketplace, error),
          );
        }
      }),
    );

    const items: NormalizedOrder[] = [];
    const errors: MarketplaceErrorResponse[] = [];
    const marketplaces: MarketplaceSummary[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        items.push(...result.value.items);
        marketplaces.push({
          marketplace: result.value.marketplace,
          total: result.value.items.length,
        });
        continue;
      }

      errors.push(this.mapMarketplaceError(result.reason));
    }

    items.sort((left, right) => this.compareOrdersByDate(left, right));
    marketplaces.sort((left, right) =>
      left.marketplace.localeCompare(right.marketplace),
    );

    return {
      range,
      total: items.length,
      marketplaces,
      items,
      errors,
    };
  }

  private parseMarketplace(marketplace: string): MarketplaceName {
    if (this.isMarketplaceName(marketplace)) {
      return marketplace;
    }

    throw new NotFoundException(
      `Marketplace "${marketplace}" no soportado. Valores válidos: ${SUPPORTED_MARKETPLACES.join(', ')}`,
    );
  }

  private isMarketplaceName(value: string): value is MarketplaceName {
    return SUPPORTED_MARKETPLACES.includes(value as MarketplaceName);
  }

  private resolveRange(query: OrdersQuery): OrdersRange {
    const from = query.fechaDesde ?? query.from;
    const to = query.fechaHasta ?? query.to;

    if (!from || !to) {
      throw new BadRequestException(
        'Debes enviar fechaDesde/fechaHasta o from/to en formato ISO-8601.',
      );
    }

    const parsedFrom = new Date(from);
    const parsedTo = new Date(to);

    if (
      Number.isNaN(parsedFrom.getTime()) ||
      Number.isNaN(parsedTo.getTime())
    ) {
      throw new BadRequestException(
        'Las fechas deben tener formato ISO-8601 válido.',
      );
    }

    if (parsedFrom > parsedTo) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor a la fecha final.',
      );
    }

    return {
      from: parsedFrom.toISOString(),
      to: parsedTo.toISOString(),
    };
  }

  private validateRecentHours(hours: number): void {
    if (
      !OrdersInteractor.ALLOWED_RECENT_HOURS.includes(hours as 24 | 48 | 72)
    ) {
      throw new BadRequestException(
        'El parámetro hours solo admite 24, 48 o 72.',
      );
    }
  }

  private async fetchMarketplaceOrders(
    marketplace: MarketplaceName,
    range: OrdersRange,
  ): Promise<NormalizedOrder[]> {
    switch (marketplace) {
      case 'megatone':
        return this.fetchMegatoneOrders(range);
      case 'oncity':
        return this.fetchOncityOrders(range);
      case 'fravega':
        return this.fetchFravegaOrders(range);
    }
  }

  private async fetchMegatoneOrders(
    range: OrdersRange,
  ): Promise<NormalizedOrder[]> {
    const response = await this.megatoneOrdersRepository.getByDateRange(range);

    if (!Array.isArray(response)) {
      throw new Error('Respuesta invalida de megatone: se esperaba un array.');
    }

    return response
      .map((order) => this.normalizeOrder('megatone', order))
      .filter((order) => this.orderIsWithinRange(order, range));
  }

  private async fetchOncityOrders(
    range: OrdersRange,
  ): Promise<NormalizedOrder[]> {
    const response = await this.oncityOrdersRepository.getByDateRange(range);

    if (!Array.isArray(response)) {
      throw new Error('Respuesta invalida de oncity: se esperaba un array.');
    }

    return response
      .map((order) => this.normalizeOrder('oncity', order))
      .filter((order) => this.orderIsWithinRange(order, range));
  }

  private async fetchFravegaOrders(
    range: OrdersRange,
  ): Promise<NormalizedOrder[]> {
    const items: NormalizedOrder[] = [];

    for (let page = 1; page <= OrdersInteractor.FRAVEGA_MAX_PAGES; page += 1) {
      const response = await this.fravegaOrdersRepository.getByPage(
        page,
        OrdersInteractor.FRAVEGA_PAGE_SIZE,
      );

      if (!Array.isArray(response.items)) {
        throw new Error('Respuesta invalida de fravega: faltan items.');
      }

      const normalizedPageItems = response.items
        .map((order) => this.normalizeOrder('fravega', order))
        .filter((order) => this.orderIsWithinRange(order, range));

      items.push(...normalizedPageItems);

      const reachedLastPage =
        response.pages <= page ||
        response.items.length < OrdersInteractor.FRAVEGA_PAGE_SIZE;

      if (reachedLastPage) {
        break;
      }
    }

    return items;
  }

  private normalizeOrder(
    marketplace: MarketplaceName,
    rawOrder:
      | GetMegatoneOrdersResponse
      | GetOncityOrdersResponse
      | FravegaOrderListItemResponse,
  ): NormalizedOrder {
    const order = this.asRecord(rawOrder) ?? {};
    const customer = this.asRecord(order.Cliente);
    const states = this.asArray(order.Estado);

    return {
      marketplace,
      orderId: this.extractOrderId(order),
      createdAt: this.extractDate(order),
      amount: this.extractAmount(order),
      customerName: this.extractCustomerName(customer),
      latestStatus: this.extractLatestStatus(states),
      raw: rawOrder,
    };
  }

  private extractOrderId(order: Record<string, unknown>): string {
    const value = order.IdOrden ?? order.idOrden ?? order.id ?? order.orderId;

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    return 'unknown';
  }

  private extractDate(order: Record<string, unknown>): string | null {
    const rawDate =
      order.Fecha ??
      order.fecha ??
      order.createdAt ??
      order.creationDate ??
      order.date ??
      order.fechaCreacion;

    if (typeof rawDate !== 'string') {
      return null;
    }

    const parsedDate = new Date(rawDate);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  private extractAmount(order: Record<string, unknown>): number | null {
    const rawAmount =
      order.MontoVenta ??
      order.montoVenta ??
      order.amount ??
      order.total ??
      order.price;

    return typeof rawAmount === 'number' ? rawAmount : null;
  }

  private extractCustomerName(
    customer: Record<string, unknown> | null,
  ): string | null {
    if (!customer) {
      return null;
    }

    const firstName =
      typeof customer.Nombre === 'string' ? customer.Nombre : null;
    const lastName =
      typeof customer.Apellido === 'string' ? customer.Apellido : null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    return fullName || null;
  }

  private extractLatestStatus(states: unknown[]): string | null {
    if (states.length === 0) {
      return null;
    }

    const normalizedStates = states
      .map((state) => this.asRecord(state))
      .filter((state): state is Record<string, unknown> => state !== null)
      .map((state) => ({
        description:
          typeof state.Descripcion === 'string' ? state.Descripcion : null,
        date:
          typeof state.Fecha === 'string' &&
          !Number.isNaN(new Date(state.Fecha).getTime())
            ? new Date(state.Fecha).toISOString()
            : null,
      }))
      .sort((left, right) => {
        if (!left.date && !right.date) {
          return 0;
        }

        if (!left.date) {
          return 1;
        }

        if (!right.date) {
          return -1;
        }

        return right.date.localeCompare(left.date);
      });

    return normalizedStates[0]?.description ?? null;
  }

  private orderIsWithinRange(
    order: NormalizedOrder,
    range: OrdersRange,
  ): boolean {
    if (!order.createdAt) {
      return false;
    }

    return order.createdAt >= range.from && order.createdAt <= range.to;
  }

  private compareOrdersByDate(
    left: NormalizedOrder,
    right: NormalizedOrder,
  ): number {
    if (!left.createdAt && !right.createdAt) {
      return 0;
    }

    if (!left.createdAt) {
      return 1;
    }

    if (!right.createdAt) {
      return -1;
    }

    return right.createdAt.localeCompare(left.createdAt);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return null;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private wrapMarketplaceError(
    marketplace: MarketplaceName,
    error: unknown,
  ): MarketplaceErrorResponse {
    if (this.isMarketplaceErrorResponse(error)) {
      return error;
    }

    if (error instanceof MarketplaceHttpError) {
      return {
        marketplace,
        statusCode: error.statusCode,
        message: error.message,
        response: error.response,
      };
    }

    return {
      marketplace,
      statusCode: 500,
      message:
        error instanceof Error ? error.message : 'Unexpected marketplace error',
      response: null,
    };
  }

  private mapMarketplaceError(error: unknown): MarketplaceErrorResponse {
    if (this.isMarketplaceErrorResponse(error)) {
      return error;
    }

    if (error instanceof MarketplaceRequestError) {
      return error.details;
    }

    return {
      marketplace: 'megatone',
      statusCode: 500,
      message:
        error instanceof Error ? error.message : 'Unexpected marketplace error',
      response: null,
    };
  }

  private isMarketplaceErrorResponse(
    value: unknown,
  ): value is MarketplaceErrorResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Partial<MarketplaceErrorResponse>;

    return (
      typeof candidate.marketplace === 'string' &&
      typeof candidate.statusCode === 'number' &&
      typeof candidate.message === 'string'
    );
  }
}
