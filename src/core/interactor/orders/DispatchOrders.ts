import { Inject, Injectable, Logger } from '@nestjs/common';
import { I_GET_FRAVEGA_ORDERS_REPOSITORY } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import { I_ORDERS_PERSISTENCE_REPOSITORY } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import { I_FLOKZU_DISPATCH_REPOSITORY } from '../../adapters/repositories/dispatch/flokzu/IFlokzuDispatchRepository';
import type { IFlokzuDispatchRepository } from '../../adapters/repositories/dispatch/flokzu/IFlokzuDispatchRepository';
import { I_POWERAPPS_DISPATCH_REPOSITORY } from '../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type { IPowerAppsDispatchRepository } from '../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type {
  MarketplaceName,
  NormalizedOrder,
} from '../../entitis/orders/Orders';
import { findMissingDispatchFields } from '../../entitis/orders/Orders';
import { OrdersInteractor } from './OrdersInteractor';
import { vtexOrderToNormalized } from './mappers/vtexOrderToNormalized';
import { mergeDefined } from './mappers/fieldHelpers';

const INGEST_MARKETPLACES: readonly MarketplaceName[] = [
  'fravega',
  // 'megatone',
  // 'oncity',
];

type DispatchStage = 'collect' | 'flokzu' | 'powerapps' | 'persist';

interface DispatchWindow {
  from: string;
  to: string;
}

export interface DispatchError {
  orderId: string;
  stage: DispatchStage;
  message: string;
}

export interface DispatchRunResult {
  window: DispatchWindow;
  dispatched: number;
  skipped: number;
  failed: number;
  errors: DispatchError[];
}

@Injectable()
export class DispatchOrders {
  private static readonly WINDOW_HOURS = 3;
  private static readonly LEGACY_PAGE_SIZE = 100;
  private static readonly LEGACY_MAX_PAGES = 50;
  private readonly logger = new Logger(DispatchOrders.name);

  constructor(
    private readonly ordersInteractor: OrdersInteractor,
    @Inject(I_GET_FRAVEGA_ORDERS_REPOSITORY)
    private readonly fravegaOrdersRepository: IGetFravegaOrdersRepository,
    @Inject(I_FLOKZU_DISPATCH_REPOSITORY)
    private readonly flokzuRepository: IFlokzuDispatchRepository,
    @Inject(I_POWERAPPS_DISPATCH_REPOSITORY)
    private readonly powerAppsRepository: IPowerAppsDispatchRepository,
    @Inject(I_ORDERS_PERSISTENCE_REPOSITORY)
    private readonly ordersPersistenceRepository: IOrdersPersistenceRepository,
  ) {}

  async run(): Promise<DispatchRunResult> {
    const window = this.resolveWindow();
    const result: DispatchRunResult = {
      window,
      dispatched: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    const orders = await this.collect(window, result);

    for (const order of orders) {
      await this.dispatchOne(order, result);
    }

    this.logger.log(
      `[dispatch] dispatched=${result.dispatched} skipped=${result.skipped} failed=${result.failed}`,
    );
    return result;
  }

  private async collect(
    window: DispatchWindow,
    result: DispatchRunResult,
  ): Promise<NormalizedOrder[]> {
    const settled = await Promise.allSettled(
      INGEST_MARKETPLACES.map((marketplace) =>
        this.collectMarketplace(marketplace, window),
      ),
    );

    const orders: NormalizedOrder[] = [];

    settled.forEach((outcome, index) => {
      const marketplace = INGEST_MARKETPLACES[index];

      if (outcome.status === 'fulfilled') {
        orders.push(...outcome.value);
        return;
      }

      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : 'collect error';
      result.errors.push({
        orderId: `(${marketplace})`,
        stage: 'collect',
        message,
      });
      this.logger.error(`[collect ${marketplace}] ${message}`);
    });

    return orders;
  }

  private async collectMarketplace(
    marketplace: MarketplaceName,
    window: DispatchWindow,
  ): Promise<NormalizedOrder[]> {
    const { items } = await this.ordersInteractor.getMarketplaceOrders(
      marketplace,
      { fechaDesde: window.from, fechaHasta: window.to },
    );

    if (marketplace !== 'fravega') {
      return items;
    }

    const cuilBySuborderId = await this.buildCuilMap(window);

    return Promise.all(
      items.map((item) => this.enrichFravegaOrder(item, cuilBySuborderId)),
    );
  }

  private async buildCuilMap(
    window: DispatchWindow,
  ): Promise<Map<string, string>> {
    const cuilBySuborderId = new Map<string, string>();

    try {
      for (let page = 1; page <= DispatchOrders.LEGACY_MAX_PAGES; page += 1) {
        const response = await this.fravegaOrdersRepository.listLegacyOrders(
          window.from,
          window.to,
          page,
          DispatchOrders.LEGACY_PAGE_SIZE,
        );

        const items = response?.items;
        if (!Array.isArray(items) || items.length === 0) {
          break;
        }

        for (const item of items) {
          if (item.suborderId && item.cuil) {
            cuilBySuborderId.set(item.suborderId, item.cuil);
          }
        }

        if (items.length < DispatchOrders.LEGACY_PAGE_SIZE) {
          break;
        }
      }
    } catch (error) {
      this.logger.warn(`[cuil map] ${this.msg(error)}`);
    }

    return cuilBySuborderId;
  }

  private async enrichFravegaOrder(
    item: NormalizedOrder,
    cuilBySuborderId: Map<string, string>,
  ): Promise<NormalizedOrder> {
    const cuil = item.suborderId
      ? (cuilBySuborderId.get(item.suborderId) ?? null)
      : null;

    try {
      const detail = await this.fravegaOrdersRepository.getOrder(item.orderId);
      const enrichment = vtexOrderToNormalized(detail);
      const customer = mergeDefined(item.customer, enrichment.customer);

      return {
        ...item,
        customer: { ...customer, document: cuil ?? customer.document },
        shipping: mergeDefined(item.shipping, enrichment.shipping),
        items: enrichment.items.length > 0 ? enrichment.items : item.items,
      };
    } catch (error) {
      this.logger.warn(`[enrich fravega] ${item.orderId}: ${this.msg(error)}`);
      return {
        ...item,
        customer: {
          ...item.customer,
          document: cuil ?? item.customer.document,
        },
      };
    }
  }

  private async dispatchOne(
    order: NormalizedOrder,
    result: DispatchRunResult,
  ): Promise<void> {
    const uniqueKey = `${order.marketplace}:${order.suborderId ?? order.orderId}`;

    const missing = findMissingDispatchFields(order);
    if (missing.length > 0) {
      this.logger.warn(
        `[dispatch ${order.orderId}] datos faltantes: ${missing.join(', ')}`,
      );
    }

    try {
      const existing =
        await this.ordersPersistenceRepository.findByUniqueKey(uniqueKey);
      if (existing.exists) {
        result.skipped += 1;
        return;
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        orderId: order.orderId,
        stage: 'persist',
        message: this.msg(error),
      });
      return;
    }

    let identifier: string;
    try {
      const flokzu = await this.flokzuRepository.createInstance(order);
      identifier = flokzu.identifier;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        orderId: order.orderId,
        stage: 'flokzu',
        message: this.msg(error),
      });
      return;
    }

    try {
      await this.powerAppsRepository.createSale(order, identifier);
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        orderId: order.orderId,
        stage: 'powerapps',
        message: this.msg(error),
      });
      return;
    }

    try {
      await this.persist(order, uniqueKey, identifier);
      result.dispatched += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        orderId: order.orderId,
        stage: 'persist',
        message: this.msg(error),
      });
    }
  }

  private async persist(
    order: NormalizedOrder,
    uniqueKey: string,
    identifier: string,
  ): Promise<void> {
    await this.ordersPersistenceRepository.insert([order]);

    const found =
      await this.ordersPersistenceRepository.findByUniqueKey(uniqueKey);
    if (!found.exists || !found.order) {
      throw new Error('No se encontro la orden recien insertada');
    }

    await this.ordersPersistenceRepository.updateStatus(found.order.id, {
      persistence_status: 'COMPLETED',
      notification_system_a_status: 'OK',
      notification_system_b_status: 'OK',
      floxu_code: identifier,
    });
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : 'error inesperado';
  }

  private resolveWindow(): DispatchWindow {
    const to = new Date();
    const from = new Date(
      to.getTime() - DispatchOrders.WINDOW_HOURS * 60 * 60 * 1000,
    );
    return { from: from.toISOString(), to: to.toISOString() };
  }
}
