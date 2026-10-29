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
  FravegaFullOrderError,
  FravegaFullOrderResponse,
} from '../../entitis/marketplace-api/fravega/orders/GetFravegaFullOrdersResponse';
import type { UpdateOrderStatusRequest } from '../../entitis/madre-api/orders/OrdersPersistenceResponse';
import type { NormalizedOrder } from '../../entitis/orders/Orders';
import {
  emptyCustomer,
  emptyShipping,
  findMissingDispatchFields,
} from '../../entitis/orders/Orders';
import { fravegaFullOrderToNormalized } from './mappers/fravegaFullOrderToNormalized';
import {
  closingStatusUpdate,
  resolveFravegaLifecycle,
} from './fravegaOrderLifecycle';
import { OrdersProcessLock } from './OrdersProcessLock';

export { DispatchInProgressError } from './OrdersProcessLock';

type DispatchStage =
  | 'collect'
  | 'source'
  | 'validate'
  | 'powerapps'
  | 'persist';

/* Motivo del FAILED: va como prefijo de last_error ([MISSING_DATA] ...) */
export type DispatchFailureReason =
  | 'SOURCE_ERROR'
  | 'MISSING_DATA'
  | 'VBI_ERROR';

export interface DispatchRange {
  from: string;
  to: string;
}

export interface DispatchError {
  orderId: string;
  stage: DispatchStage;
  message: string;
}

export interface DispatchRunResult {
  window: DispatchRange;
  collected: number;
  dispatched: number;
  // Nuevas que ya estaban canceladas en Fravega: no se mandan a VBI
  cancelled: number;
  skipped: number;
  failed: number;
  errors: DispatchError[];
}

export interface DispatchOutcome {
  persistence_status: 'PENDING' | 'COMPLETED' | 'FAILED';
  last_error: string | null;
}

export interface DispatchRetryResult extends DispatchOutcome {
  uniqueKey: string;
}

export class DispatchOrderNotFoundError extends Error {
  constructor(uniqueKey: string) {
    super(`No existe la orden ${uniqueKey} en madre`);
  }
}

export class DispatchOrderNotRetryableError extends Error {}

@Injectable()
export class DispatchOrders {
  private static readonly DEFAULT_LOOKBACK_HOURS = 24;
  private static readonly OVERLAP_MINUTES = 30;
  private static readonly PAGE_SIZE = 50;
  private static readonly MAX_PAGES = 100;
  private readonly logger = new Logger(DispatchOrders.name);

  // Hasta donde llego el ultimo sync automatico completo. En memoria: tras un
  // reinicio se vuelve a mirar DEFAULT_LOOKBACK_HOURS y madre evita duplicados
  private lastSyncedUntil: Date | null = null;

  constructor(
    @Inject(I_GET_FRAVEGA_ORDERS_REPOSITORY)
    private readonly fravegaOrdersRepository: IGetFravegaOrdersRepository,
    @Inject(I_POWERAPPS_DISPATCH_REPOSITORY)
    private readonly powerAppsRepository: IPowerAppsDispatchRepository,
    @Inject(I_ORDERS_PERSISTENCE_REPOSITORY)
    private readonly ordersPersistenceRepository: IOrdersPersistenceRepository,
    private readonly lock: OrdersProcessLock,
  ) {}

  /**
   * Sin rango: procesa las ordenes nuevas desde el ultimo sync.
   * Con rango: reprocesa ese periodo a mano (las que ya estan en madre se saltean).
   */
  async run(range?: DispatchRange): Promise<DispatchRunResult> {
    return this.lock.run(async () => {
      const window = range ?? this.resolveWindow();
      const result: DispatchRunResult = {
        window,
        collected: 0,
        dispatched: 0,
        cancelled: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      };

      const { orders, sourceErrors, complete } = await this.collect(
        window,
        result,
      );
      result.collected = orders.length + sourceErrors.length;

      for (const order of orders) {
        await this.dispatchOne(order, result);
      }

      for (const sourceError of sourceErrors) {
        await this.recordSourceError(sourceError, result);
      }

      if (!range && complete) {
        this.lastSyncedUntil = new Date(window.to);
      }

      this.logger.log(
        `[dispatch ${window.from} -> ${window.to}] collected=${result.collected} dispatched=${result.dispatched} cancelled=${result.cancelled} skipped=${result.skipped} failed=${result.failed}`,
      );
      return result;
    });
  }

  /* Reintenta una orden FAILED: vuelve a consultarla en Fravega y la reenvia a VBI si sigue vigente */
  async retry(uniqueKey: string): Promise<DispatchRetryResult> {
    return this.lock.run(async () => {
      const found =
        await this.ordersPersistenceRepository.findByUniqueKey(uniqueKey);

      if (!found.exists || !found.order) {
        throw new DispatchOrderNotFoundError(uniqueKey);
      }

      const persisted = found.order;

      // PENDING y COMPLETED ya pasaron por VBI (o estan cerradas): reenviarlas duplicaria la venta
      if (persisted.persistence_status !== 'FAILED') {
        throw new DispatchOrderNotRetryableError(
          `Solo se reintentan ordenes FAILED (estado actual: ${persisted.persistence_status})`,
        );
      }

      if (
        persisted.marketplace !== 'fravega' ||
        !persisted.external_suborder_id
      ) {
        throw new DispatchOrderNotRetryableError(
          `El reintento solo esta disponible para ordenes de fravega`,
        );
      }

      const result = this.emptyResult();
      let fullOrder: FravegaFullOrderResponse;

      try {
        fullOrder = await this.fravegaOrdersRepository.getFullOrder(
          persisted.external_suborder_id,
          persisted.external_order_id,
        );
      } catch (error) {
        const lastError = await this.markFailed(
          persisted.id,
          persisted.external_order_id,
          'SOURCE_ERROR',
          this.msg(error),
          'source',
          result,
        );
        return {
          uniqueKey,
          persistence_status: 'FAILED',
          last_error: lastError,
        };
      }

      const outcome = await this.process(fullOrder, persisted.id, result);
      return { uniqueKey, ...outcome };
    });
  }

  private async collect(
    window: DispatchRange,
    result: DispatchRunResult,
  ): Promise<{
    orders: FravegaFullOrderResponse[];
    sourceErrors: FravegaFullOrderError[];
    complete: boolean;
  }> {
    const orders: FravegaFullOrderResponse[] = [];
    const sourceErrors: FravegaFullOrderError[] = [];

    try {
      for (let page = 1; page <= DispatchOrders.MAX_PAGES; page += 1) {
        const response = await this.fravegaOrdersRepository.listFullOrders({
          from: window.from,
          to: window.to,
          page,
          pageSize: DispatchOrders.PAGE_SIZE,
        });

        orders.push(...(response.items ?? []));
        sourceErrors.push(...(response.errors ?? []));

        // Fravega puede devolver paginas con menos items que pageSize aunque
        // haya mas: se corta por `pages`, no por el largo de la pagina
        if (page >= response.pages) {
          return { orders, sourceErrors, complete: true };
        }
      }

      this.logger.warn(
        `[collect fravega] se alcanzo el maximo de ${DispatchOrders.MAX_PAGES} paginas`,
      );
    } catch (error) {
      const message = this.msg(error);
      result.errors.push({ orderId: '(fravega)', stage: 'collect', message });
      this.logger.error(`[collect fravega] ${message}`);
    }

    return { orders, sourceErrors, complete: false };
  }

  private async dispatchOne(
    fullOrder: FravegaFullOrderResponse,
    result: DispatchRunResult,
  ): Promise<void> {
    const order = fravegaFullOrderToNormalized(fullOrder);
    let id: number | null;

    try {
      id = await this.insertIfNew(order);
    } catch (error) {
      this.addError(result, order.orderId, 'persist', this.msg(error));
      return;
    }

    if (id === null) {
      result.skipped += 1;
      return;
    }

    await this.process(fullOrder, id, result);
  }

  /* Ordenes que marketplace-api no pudo completar (fallo VTEX o Seller Central) */
  private async recordSourceError(
    sourceError: FravegaFullOrderError,
    result: DispatchRunResult,
  ): Promise<void> {
    const orderId = String(sourceError.orderId);
    const order: NormalizedOrder = {
      marketplace: 'fravega',
      orderId,
      suborderId: sourceError.suborderId,
      createdAt: null,
      amount: null,
      latestStatus: null,
      customer: emptyCustomer(),
      shipping: emptyShipping(),
      items: [],
      raw: { sourceError },
    };

    let id: number | null;

    try {
      id = await this.insertIfNew(order);
    } catch (error) {
      this.addError(result, orderId, 'persist', this.msg(error));
      return;
    }

    if (id === null) {
      result.skipped += 1;
      return;
    }

    await this.markFailed(
      id,
      orderId,
      'SOURCE_ERROR',
      `${sourceError.source}: ${sourceError.message}`,
      'source',
      result,
    );
  }

  /**
   * Valida y envia a VBI una orden que ya esta guardada en madre.
   * Si VBI la acepta queda PENDING hasta que Fravega la entregue o cancele
   * (de eso se encarga SyncOrderStatuses), salvo que ya este entregada.
   */
  private async process(
    fullOrder: FravegaFullOrderResponse,
    id: number,
    result: DispatchRunResult,
  ): Promise<DispatchOutcome> {
    const order = fravegaFullOrderToNormalized(fullOrder);
    const lifecycle = resolveFravegaLifecycle(fullOrder);

    // Una venta cancelada no se crea en VBI
    const closing = closingStatusUpdate(lifecycle);
    if (lifecycle.state === 'cancelled' && closing) {
      try {
        await this.ordersPersistenceRepository.updateStatus(id, closing);
        result.cancelled += 1;
      } catch (error) {
        this.addError(
          result,
          order.orderId,
          'persist',
          `No se pudo marcar cancelada: ${this.msg(error)}`,
        );
        return { persistence_status: 'PENDING', last_error: null };
      }
      return {
        persistence_status: 'COMPLETED',
        last_error: closing.last_error ?? null,
      };
    }

    const missing = findMissingDispatchFields(order);
    if (missing.length > 0) {
      return this.failed(
        await this.markFailed(
          id,
          order.orderId,
          'MISSING_DATA',
          `Faltan datos del comprador: ${missing.join(', ')}`,
          'validate',
          result,
        ),
      );
    }

    let sale: PowerAppsDispatchResult;
    try {
      sale = await this.powerAppsRepository.createSale(order);
    } catch (error) {
      return this.failed(
        await this.markFailed(
          id,
          order.orderId,
          'VBI_ERROR',
          this.msg(error),
          'powerapps',
          result,
          { notification_system_b_status: 'failed' },
        ),
      );
    }

    const persistenceStatus =
      lifecycle.state === 'delivered' ? 'COMPLETED' : 'PENDING';

    try {
      await this.ordersPersistenceRepository.updateStatus(id, {
        persistence_status: persistenceStatus,
        notification_system_b_status: 'success',
        floxu_code: sale.tlqtNumber,
        last_error: null,
      });
      result.dispatched += 1;
      return { persistence_status: persistenceStatus, last_error: null };
    } catch (error) {
      // Ya esta en VBI pero madre no lo sabe: no se reintenta solo para no duplicar la venta
      const message = `Enviada a VBI (${sale.tlqtNumber ?? 'sin tlqtNumber'}) pero no se pudo guardar en madre: ${this.msg(error)}`;
      this.addError(result, order.orderId, 'persist', message);
      return { persistence_status: 'PENDING', last_error: message };
    }
  }

  private failed(lastError: string): DispatchOutcome {
    return { persistence_status: 'FAILED', last_error: lastError };
  }

  /* Guarda la orden en madre si no existe. Devuelve su id, o null si ya existia */
  private async insertIfNew(order: NormalizedOrder): Promise<number | null> {
    const uniqueKey = this.buildUniqueKey(order);
    const existing =
      await this.ordersPersistenceRepository.findByUniqueKey(uniqueKey);

    if (existing.exists) {
      return null;
    }

    await this.ordersPersistenceRepository.insert([order]);

    // El batch de madre no devuelve ids
    const inserted =
      await this.ordersPersistenceRepository.findByUniqueKey(uniqueKey);
    if (!inserted.exists || !inserted.order) {
      throw new Error(`No se encontro la orden recien insertada ${uniqueKey}`);
    }

    return inserted.order.id;
  }

  private async markFailed(
    id: number,
    orderId: string,
    reason: DispatchFailureReason,
    message: string,
    stage: DispatchStage,
    result: DispatchRunResult,
    extra: UpdateOrderStatusRequest = {},
  ): Promise<string> {
    const lastError = `[${reason}] ${message}`;
    this.addError(result, orderId, stage, lastError);

    try {
      await this.ordersPersistenceRepository.updateStatus(id, {
        ...extra,
        persistence_status: 'FAILED',
        last_error: lastError,
      });
    } catch (error) {
      this.addError(
        result,
        orderId,
        'persist',
        `No se pudo marcar FAILED: ${this.msg(error)}`,
        false,
      );
    }

    return lastError;
  }

  private addError(
    result: DispatchRunResult,
    orderId: string,
    stage: DispatchStage,
    message: string,
    countAsFailed = true,
  ): void {
    if (countAsFailed) result.failed += 1;
    result.errors.push({ orderId, stage, message });
    this.logger.warn(`[dispatch ${orderId}] ${stage}: ${message}`);
  }

  private buildUniqueKey(order: NormalizedOrder): string {
    return `${order.marketplace}:${order.suborderId ?? order.orderId}`;
  }

  private emptyResult(): DispatchRunResult {
    const now = new Date().toISOString();
    return {
      window: { from: now, to: now },
      collected: 0,
      dispatched: 0,
      cancelled: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : 'error inesperado';
  }

  private resolveWindow(): DispatchRange {
    const to = new Date();
    const since =
      this.lastSyncedUntil ??
      new Date(
        to.getTime() - DispatchOrders.DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000,
      );
    const from = new Date(
      since.getTime() - DispatchOrders.OVERLAP_MINUTES * 60 * 1000,
    );
    return { from: from.toISOString(), to: to.toISOString() };
  }
}
