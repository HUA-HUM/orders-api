import { Inject, Injectable, Logger } from '@nestjs/common';
import { I_GET_FRAVEGA_ORDERS_REPOSITORY } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import { I_ORDERS_PERSISTENCE_REPOSITORY } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { FravegaOrderDetailResponse } from '../../entitis/marketplace-api/fravega/orders/GetFravegaOrderDetailResponse';
import type { MarketplaceName, NormalizedOrder } from '../../entitis/orders/Orders';
import { OrdersInteractor } from './OrdersInteractor';

const INGEST_MARKETPLACES: readonly MarketplaceName[] = [
  'fravega',
  'megatone',
  // 'oncity' — fuera del flujo de ingesta: MontoVenta sin factor de escala (I-1) y sin productos/documento (I-2). Reactivar al destrabarse.
];

export interface MarketplaceIngestResult {
  marketplace: MarketplaceName;
  inserted: number;
  skipped: number;
}

export interface IngestRunResult {
  window: { from: string; to: string };
  results: MarketplaceIngestResult[];
  errors: { marketplace: MarketplaceName; message: string }[];
}

@Injectable()
export class PersistMarketplaceOrders {
  private static readonly WINDOW_HOURS = 3;
  private readonly logger = new Logger(PersistMarketplaceOrders.name);

  constructor(
    private readonly ordersInteractor: OrdersInteractor,
    @Inject(I_GET_FRAVEGA_ORDERS_REPOSITORY)
    private readonly fravegaOrdersRepository: IGetFravegaOrdersRepository,
    @Inject(I_ORDERS_PERSISTENCE_REPOSITORY)
    private readonly ordersPersistenceRepository: IOrdersPersistenceRepository,
  ) {}

  async run(): Promise<IngestRunResult> {
    const window = this.resolveWindow();
    const settled = await Promise.allSettled(
      INGEST_MARKETPLACES.map((marketplace) =>
        this.ingestMarketplace(marketplace, window),
      ),
    );

    const results: MarketplaceIngestResult[] = [];
    const errors: { marketplace: MarketplaceName; message: string }[] = [];

    settled.forEach((outcome, index) => {
      const marketplace = INGEST_MARKETPLACES[index];

      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
        this.logger.log(
          `[ingest ${marketplace}] inserted=${outcome.value.inserted} skipped=${outcome.value.skipped}`,
        );
        return;
      }

      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : 'Unexpected ingest error';
      errors.push({ marketplace, message });
      this.logger.error(`[ingest ${marketplace}] ${message}`);
    });

    return { window, results, errors };
  }

  private async ingestMarketplace(
    marketplace: MarketplaceName,
    window: { from: string; to: string },
  ): Promise<MarketplaceIngestResult> {
    const { items } = await this.ordersInteractor.getMarketplaceOrders(
      marketplace,
      { fechaDesde: window.from, fechaHasta: window.to },
    );

    const orders =
      marketplace === 'fravega' ? await this.enrichFravega(items) : items;

    if (orders.length === 0) {
      return { marketplace, inserted: 0, skipped: 0 };
    }

    const result = await this.ordersPersistenceRepository.insert(orders);
    return {
      marketplace,
      inserted: result.inserted,
      skipped: result.skipped,
    };
  }

  private async enrichFravega(
    items: NormalizedOrder[],
  ): Promise<NormalizedOrder[]> {
    return Promise.all(items.map((item) => this.enrichFravegaOrder(item)));
  }

  private async enrichFravegaOrder(
    item: NormalizedOrder,
  ): Promise<NormalizedOrder> {
    if (!item.suborderId) {
      return item;
    }

    try {
      const detail = await this.fravegaOrdersRepository.getDetail(
        item.suborderId,
        item.orderId,
      );
      return { ...item, email: this.extractEmail(detail) };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'detail fetch failed';
      this.logger.warn(
        `[ingest fravega] no se pudo enriquecer ${item.suborderId}: ${message}`,
      );
      return item;
    }
  }

  private extractEmail(detail: FravegaOrderDetailResponse): string | null {
    return detail.billingInfo?.billingPerson?.email ?? null;
  }

  private resolveWindow(): { from: string; to: string } {
    const to = new Date();
    const from = new Date(
      to.getTime() - PersistMarketplaceOrders.WINDOW_HOURS * 60 * 60 * 1000,
    );
    return { from: from.toISOString(), to: to.toISOString() };
  }
}
