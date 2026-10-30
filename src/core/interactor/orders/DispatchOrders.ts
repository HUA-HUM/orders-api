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
import type {
  OrderProcessingFields,
  PersistenceStatus,
} from '../../entitis/madre-api/orders/NormalizedOrderRequest';
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

export interface DispatchRetryResult {
  uniqueKey: string;
  persistence_status: PersistenceStatus;
  last_error: string | null;
}

/* Como queda la orden tras validarla y mandarla a VBI, antes de guardarla en madre */
type DispatchEvaluation = {
  fields: OrderProcessingFields & {
    persistence_status: PersistenceStatus;
    last_error: string | null;
  };
} & (
  | { kind: 'dispatched' | 'cancelled' }
  | { kind: 'failed'; stage: DispatchStage }
);

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

      // Si alguna no se pudo guardar la marca no avanza: el proximo sync vuelve a cubrir el periodo
      const persistFailed = result.errors.some(
        (error) => error.stage === 'persist',
      );
      if (!range && complete && !persistFailed) {
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
        return this.updateEvaluated(
          persisted.id,
          uniqueKey,
          persisted.external_order_id,
          this.failure('SOURCE_ERROR', this.msg(error), 'source'),
          {},
          result,
        );
      }

      const order = fravegaFullOrderToNormalized(fullOrder);
      const evaluation = await this.evaluate(fullOrder, order);

      // Tambien se refrescan los datos que pudieron cambiar en Fravega
      return this.updateEvaluated(
        persisted.id,
        uniqueKey,
        order.orderId,
        evaluation,
        {
          status: order.latestStatus,
          delivery_status: order.latestDeliveryStatus ?? null,
          estimated_delivery_date: order.shipping.estimatedDeliveryDate,
        },
        result,
      );
    });
  }

  /* Guarda el resultado del reintento sobre la orden que ya esta en madre */
  private async updateEvaluated(
    id: number,
    uniqueKey: string,
    orderId: string,
    evaluation: DispatchEvaluation,
    refresh: UpdateOrderStatusRequest,
    result: DispatchRunResult,
  ): Promise<DispatchRetryResult> {
    try {
      await this.ordersPersistenceRepository.updateStatus(id, {
        ...refresh,
        ...evaluation.fields,
      });
    } catch (error) {
      const message = this.persistFailure(evaluation, error);
      this.addError(result, orderId, 'persist', message);
      // En madre sigue FAILED
      return { uniqueKey, persistence_status: 'FAILED', last_error: message };
    }

    this.tally(evaluation, orderId, result);
    return {
      uniqueKey,
      persistence_status: evaluation.fields.persistence_status,
      last_error: evaluation.fields.last_error,
    };
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

    if (await this.shouldSkip(order, result)) {
      return;
    }

    const evaluation = await this.evaluate(fullOrder, order);
    await this.insertEvaluated(order, evaluation, result);
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

    if (await this.shouldSkip(order, result)) {
      return;
    }

    await this.insertEvaluated(
      order,
      this.failure(
        'SOURCE_ERROR',
        `${sourceError.source}: ${sourceError.message}`,
        'source',
      ),
      result,
    );
  }

  /**
   * Decide como queda la orden y la manda a VBI si corresponde. No guarda nada en madre.
   * Si VBI la acepta queda PENDING hasta que Fravega la entregue o cancele
   * (de eso se encarga SyncOrderStatuses), salvo que ya este entregada.
   */
  private async evaluate(
    fullOrder: FravegaFullOrderResponse,
    order: NormalizedOrder,
  ): Promise<DispatchEvaluation> {
    const lifecycle = resolveFravegaLifecycle(fullOrder);

    // Una venta cancelada no se crea en VBI
    if (lifecycle.state === 'cancelled') {
      return {
        kind: 'cancelled',
        fields: {
          persistence_status: 'CANCELLED',
          last_error: closingStatusUpdate(lifecycle)?.last_error ?? null,
        },
      };
    }

    const missing = findMissingDispatchFields(order);
    if (missing.length > 0) {
      return this.failure(
        'MISSING_DATA',
        `Faltan datos del comprador: ${missing.join(', ')}`,
        'validate',
      );
    }

    let sale: PowerAppsDispatchResult;
    try {
      sale = await this.powerAppsRepository.createSale(order);
    } catch (error) {
      return this.failure('VBI_ERROR', this.msg(error), 'powerapps', {
        notification_system_b_status: 'failed',
      });
    }

    return {
      kind: 'dispatched',
      fields: {
        persistence_status:
          lifecycle.state === 'delivered' ? 'COMPLETED' : 'PENDING',
        notification_system_b_status: 'success',
        floxu_code: sale.tlqtNumber,
        vbi_sale_id: sale.saleId,
        vbi_nro_venta: sale.nroVenta,
        last_error: null,
      },
    };
  }

  private failure(
    reason: DispatchFailureReason,
    message: string,
    stage: DispatchStage,
    extra: OrderProcessingFields = {},
  ): DispatchEvaluation {
    return {
      kind: 'failed',
      stage,
      fields: {
        ...extra,
        persistence_status: 'FAILED',
        last_error: `[${reason}] ${message}`,
      },
    };
  }

  /* Ya esta en madre (se saltea) o no se pudo consultar (no se manda a VBI a ciegas) */
  private async shouldSkip(
    order: NormalizedOrder,
    result: DispatchRunResult,
  ): Promise<boolean> {
    try {
      const existing = await this.ordersPersistenceRepository.findByUniqueKey(
        this.buildUniqueKey(order),
      );
      if (existing.exists) {
        result.skipped += 1;
        return true;
      }
      return false;
    } catch (error) {
      this.addError(result, order.orderId, 'persist', this.msg(error));
      return true;
    }
  }

  /* Inserta la orden ya procesada: un solo batch con el resultado, sin PATCH posterior */
  private async insertEvaluated(
    order: NormalizedOrder,
    evaluation: DispatchEvaluation,
    result: DispatchRunResult,
  ): Promise<void> {
    try {
      await this.ordersPersistenceRepository.insert([
        { order, processing: evaluation.fields },
      ]);
    } catch (error) {
      this.addError(
        result,
        order.orderId,
        'persist',
        this.persistFailure(evaluation, error),
      );
      return;
    }

    this.tally(evaluation, order.orderId, result);
  }

  private tally(
    evaluation: DispatchEvaluation,
    orderId: string,
    result: DispatchRunResult,
  ): void {
    if (evaluation.kind === 'failed') {
      this.addError(
        result,
        orderId,
        evaluation.stage,
        evaluation.fields.last_error ?? '',
      );
    } else if (evaluation.kind === 'dispatched') {
      result.dispatched += 1;
    } else {
      result.cancelled += 1;
    }
  }

  private persistFailure(
    evaluation: DispatchEvaluation,
    error: unknown,
  ): string {
    if (evaluation.kind !== 'dispatched') {
      return `No se pudo guardar en madre: ${this.msg(error)}`;
    }
    // VBI deduplica por NROVENTA: al reprocesarla responde duplicate y se guarda
    return `Enviada a VBI (${evaluation.fields.floxu_code ?? 'sin numero TLQV'}) pero no se pudo guardar en madre: ${this.msg(error)}. Al volver a sincronizarla VBI la toma como duplicada`;
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
