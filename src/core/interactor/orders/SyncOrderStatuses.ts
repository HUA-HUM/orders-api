import { Inject, Injectable, Logger } from '@nestjs/common';
import { I_GET_FRAVEGA_ORDERS_REPOSITORY } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import { I_ORDERS_PERSISTENCE_REPOSITORY } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { PersistedOrder } from '../../entitis/madre-api/orders/OrdersPersistenceResponse';
import {
  closingStatusUpdate,
  resolveFravegaLifecycle,
} from './fravegaOrderLifecycle';
import { OrdersProcessLock } from './OrdersProcessLock';

export interface SyncOrderStatusesError {
  uniqueKey: string;
  message: string;
}

export interface SyncOrderStatusesResult {
  checked: number;
  delivered: number;
  cancelled: number;
  open: number;
  // Pendientes de otros marketplaces: todavia no se siguen
  ignored: number;
  errors: SyncOrderStatusesError[];
}

/**
 * Recorre las ordenes PENDING de madre y cierra las que Fravega ya entrego
 * o cancelo (COMPLETED). No avisa a VBI.
 */
@Injectable()
export class SyncOrderStatuses {
  // madre no pagina /pending: se piden todas de una vez
  private static readonly PENDING_LIMIT = 1000;
  private static readonly CONCURRENCY = 5;
  private readonly logger = new Logger(SyncOrderStatuses.name);

  constructor(
    @Inject(I_GET_FRAVEGA_ORDERS_REPOSITORY)
    private readonly fravegaOrdersRepository: IGetFravegaOrdersRepository,
    @Inject(I_ORDERS_PERSISTENCE_REPOSITORY)
    private readonly ordersPersistenceRepository: IOrdersPersistenceRepository,
    private readonly lock: OrdersProcessLock,
  ) {}

  async run(): Promise<SyncOrderStatusesResult> {
    return this.lock.run(async () => {
      const result: SyncOrderStatusesResult = {
        checked: 0,
        delivered: 0,
        cancelled: 0,
        open: 0,
        ignored: 0,
        errors: [],
      };

      const pending = await this.ordersPersistenceRepository.findPending(
        SyncOrderStatuses.PENDING_LIMIT,
      );
      if (pending.items.length >= SyncOrderStatuses.PENDING_LIMIT) {
        this.logger.warn(
          `[status-sync] madre devolvio el maximo de ${SyncOrderStatuses.PENDING_LIMIT} pendientes: puede haber mas`,
        );
      }

      const fravega = pending.items.filter(
        (order) =>
          order.marketplace === 'fravega' && order.external_suborder_id,
      );
      result.ignored = pending.items.length - fravega.length;

      for (let i = 0; i < fravega.length; i += SyncOrderStatuses.CONCURRENCY) {
        await Promise.all(
          fravega
            .slice(i, i + SyncOrderStatuses.CONCURRENCY)
            .map((order) => this.check(order, result)),
        );
      }

      this.logger.log(
        `[status-sync] checked=${result.checked} delivered=${result.delivered} cancelled=${result.cancelled} open=${result.open} errors=${result.errors.length}`,
      );
      return result;
    });
  }

  private async check(
    order: PersistedOrder,
    result: SyncOrderStatusesResult,
  ): Promise<void> {
    try {
      const fullOrder = await this.fravegaOrdersRepository.getFullOrder(
        order.external_suborder_id as string,
        order.external_order_id,
      );
      result.checked += 1;

      const lifecycle = resolveFravegaLifecycle(fullOrder);
      const update = closingStatusUpdate(lifecycle);

      if (!update) {
        result.open += 1;
        return;
      }

      await this.ordersPersistenceRepository.updateStatus(order.id, update);
      if (lifecycle.state === 'cancelled') {
        result.cancelled += 1;
      } else {
        result.delivered += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'error inesperado';
      result.errors.push({ uniqueKey: order.unique_key, message });
      this.logger.warn(`[status-sync ${order.unique_key}] ${message}`);
    }
  }
}
