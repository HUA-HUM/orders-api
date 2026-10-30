import { Inject, Injectable, Logger } from '@nestjs/common';
import { I_GET_FRAVEGA_ORDERS_REPOSITORY } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import type { IGetFravegaOrdersRepository } from '../../adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import { I_ORDERS_PERSISTENCE_REPOSITORY } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { IOrdersPersistenceRepository } from '../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import { I_POWERAPPS_DISPATCH_REPOSITORY } from '../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type {
  IPowerAppsDispatchRepository,
  PowerAppsDispatchResult,
} from '../../adapters/repositories/dispatch/powerapps/IPowerAppsDispatchRepository';
import type {
  PersistedOrder,
  UpdateOrderStatusRequest,
} from '../../entitis/madre-api/orders/OrdersPersistenceResponse';
import {
  closingStatusUpdate,
  resolveFravegaLifecycle,
} from './fravegaOrderLifecycle';
import type { FravegaOrderLifecycle } from './fravegaOrderLifecycle';
import type { NormalizedOrder } from '../../entitis/orders/Orders';
import { fravegaFullOrderToNormalized } from './mappers/fravegaFullOrderToNormalized';
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
  // Ordenes enviadas a VBI a las que se les completo el numero TLQV (floxu_code)
  tlqtFilled: number;
  // Pendientes de otros marketplaces: todavia no se siguen
  ignored: number;
  // Compradas hace mas de ORDERS_STATUS_MAX_AGE_DAYS: no se revisan
  tooOld: number;
  errors: SyncOrderStatusesError[];
}

/**
 * Recorre las ordenes PENDING de madre y cierra las que Fravega ya entrego (COMPLETED)
 * o cancelo (CANCELLED). Actualiza el status y el estado de entrega si cambiaron.
 * A las ya enviadas a VBI sin numero TLQV se lo completa: VBI lo asigna despues
 * de crear la venta y lo devuelve al reenviarla como duplicada.
 */
@Injectable()
export class SyncOrderStatuses {
  // madre devuelve hasta 200 por pagina
  private static readonly PAGE_LIMIT = 200;
  private static readonly MAX_PAGES = 50;
  private static readonly CONCURRENCY = 5;
  // Una devolucion puede llegar despues de facturar (hasta ~5 semanas) + entrega + 10 dias de arrepentimiento
  private static readonly DEFAULT_MAX_AGE_DAYS = 60;
  private readonly logger = new Logger(SyncOrderStatuses.name);

  constructor(
    @Inject(I_GET_FRAVEGA_ORDERS_REPOSITORY)
    private readonly fravegaOrdersRepository: IGetFravegaOrdersRepository,
    @Inject(I_ORDERS_PERSISTENCE_REPOSITORY)
    private readonly ordersPersistenceRepository: IOrdersPersistenceRepository,
    @Inject(I_POWERAPPS_DISPATCH_REPOSITORY)
    private readonly powerAppsRepository: IPowerAppsDispatchRepository,
    private readonly lock: OrdersProcessLock,
  ) {}

  async run(): Promise<SyncOrderStatusesResult> {
    return this.lock.run(async () => {
      const result: SyncOrderStatusesResult = {
        checked: 0,
        delivered: 0,
        cancelled: 0,
        open: 0,
        tlqtFilled: 0,
        ignored: 0,
        tooOld: 0,
        errors: [],
      };

      const pending = await this.loadPending();

      const trackable = pending.filter(
        (order) =>
          order.marketplace === 'fravega' && order.external_suborder_id,
      );
      result.ignored = pending.length - trackable.length;

      // Sin fecha de compra se revisa igual
      const since = Date.now() - this.maxAgeDays() * 24 * 60 * 60 * 1000;
      const fravega = trackable.filter(
        (order) =>
          !order.purchase_date ||
          new Date(order.purchase_date).getTime() >= since,
      );
      result.tooOld = trackable.length - fravega.length;

      for (let i = 0; i < fravega.length; i += SyncOrderStatuses.CONCURRENCY) {
        await Promise.all(
          fravega
            .slice(i, i + SyncOrderStatuses.CONCURRENCY)
            .map((order) => this.check(order, result)),
        );
      }

      this.logger.log(
        `[status-sync] checked=${result.checked} delivered=${result.delivered} cancelled=${result.cancelled} open=${result.open} tlqtFilled=${result.tlqtFilled} tooOld=${result.tooOld} errors=${result.errors.length}`,
      );
      return result;
    });
  }

  /* ORDERS_STATUS_MAX_AGE_DAYS: dias desde la compra en los que se sigue revisando una orden */
  private maxAgeDays(): number {
    const raw = process.env.ORDERS_STATUS_MAX_AGE_DAYS;
    if (raw === undefined || raw.trim() === '') {
      return SyncOrderStatuses.DEFAULT_MAX_AGE_DAYS;
    }

    const days = Number(raw);
    if (!Number.isInteger(days) || days <= 0) {
      this.logger.error(
        `ORDERS_STATUS_MAX_AGE_DAYS invalido ("${raw}"): se usan ${SyncOrderStatuses.DEFAULT_MAX_AGE_DAYS} dias`,
      );
      return SyncOrderStatuses.DEFAULT_MAX_AGE_DAYS;
    }
    return days;
  }

  /* Todas las PENDING de Fravega, pagina por pagina */
  private async loadPending(): Promise<PersistedOrder[]> {
    const orders: PersistedOrder[] = [];
    let afterId: number | undefined;

    for (let page = 1; page <= SyncOrderStatuses.MAX_PAGES; page += 1) {
      const response = await this.ordersPersistenceRepository.findPending({
        limit: SyncOrderStatuses.PAGE_LIMIT,
        marketplace: 'fravega',
        afterId,
      });
      orders.push(...response.items);

      if (response.nextAfterId === null || response.nextAfterId === undefined) {
        return orders;
      }
      afterId = response.nextAfterId;
    }

    this.logger.warn(
      `[status-sync] se alcanzo el maximo de ${SyncOrderStatuses.MAX_PAGES} paginas de pendientes`,
    );
    return orders;
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

      const normalized = fravegaFullOrderToNormalized(fullOrder);
      const lifecycle = resolveFravegaLifecycle(fullOrder);
      const sale = await this.fetchMissingTlqt(
        order,
        normalized,
        lifecycle,
        result,
      );

      // Estado, cierre y datos de VBI van en un solo PATCH; si nada cambio no se llama
      const update: UpdateOrderStatusRequest = {
        ...this.rawStatusChanges(order, normalized),
        ...closingStatusUpdate(lifecycle),
        ...(sale?.tlqtNumber && { floxu_code: sale.tlqtNumber }),
        ...(sale?.saleId && !order.vbi_sale_id && { vbi_sale_id: sale.saleId }),
        ...(sale?.nroVenta &&
          !order.vbi_nro_venta && { vbi_nro_venta: sale.nroVenta }),
      };

      if (Object.keys(update).length > 0) {
        await this.ordersPersistenceRepository.updateStatus(order.id, update);
      }

      if (sale?.tlqtNumber) result.tlqtFilled += 1;
      if (lifecycle.state === 'cancelled') {
        result.cancelled += 1;
      } else if (lifecycle.state === 'delivered') {
        result.delivered += 1;
      } else {
        result.open += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'error inesperado';
      result.errors.push({ uniqueKey: order.unique_key, message });
      this.logger.warn(`[status-sync ${order.unique_key}] ${message}`);
    }
  }

  /**
   * Reenvia a VBI una orden ya enviada que no tiene numero TLQV: VBI responde
   * duplicate (no crea otra venta) con el numero. Solo para ordenes con
   * b_status success, sin floxu_code y no canceladas en Fravega.
   * Si falla se informa y sigue: el cierre de la orden no depende de esto.
   */
  /* Status y estado de entrega de Fravega que cambiaron respecto de madre (sin pisar con vacios) */
  private rawStatusChanges(
    order: PersistedOrder,
    normalized: NormalizedOrder,
  ): UpdateOrderStatusRequest {
    const changes: UpdateOrderStatusRequest = {};
    const status = normalized.latestStatus;
    const deliveryStatus = normalized.latestDeliveryStatus ?? null;

    if (status && status !== order.status) {
      changes.status = status;
    }
    if (deliveryStatus && deliveryStatus !== order.delivery_status) {
      changes.delivery_status = deliveryStatus;
    }
    return changes;
  }

  private async fetchMissingTlqt(
    order: PersistedOrder,
    normalized: NormalizedOrder,
    lifecycle: FravegaOrderLifecycle,
    result: SyncOrderStatusesResult,
  ): Promise<PowerAppsDispatchResult | null> {
    if (
      order.notification_system_b_status !== 'success' ||
      order.floxu_code ||
      lifecycle.state === 'cancelled'
    ) {
      return null;
    }

    try {
      return await this.powerAppsRepository.createSale(normalized);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'error inesperado';
      result.errors.push({
        uniqueKey: order.unique_key,
        message: `No se pudo completar el numero TLQV: ${message}`,
      });
      this.logger.warn(`[status-sync ${order.unique_key}] TLQV: ${message}`);
      return null;
    }
  }
}
