import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, validateCronExpression } from 'cron';
import {
  DispatchInProgressError,
  DispatchOrders,
} from '../../../core/interactor/orders/DispatchOrders';
import { SyncOrderStatuses } from '../../../core/interactor/orders/SyncOrderStatuses';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

interface OrdersCronDefinition {
  name: string;
  // Expresion cron (con segundos): si no esta o es invalida se usa defaultSchedule
  scheduleEnv: string;
  defaultSchedule: string;
  // Con 'false' el cron no se registra
  enabledEnv: string;
  run: () => Promise<unknown>;
}

/**
 * Crons de ordenes configurables por entorno. Se registran al iniciar el modulo
 * y no con @Cron porque main.ts carga el .env despues de evaluar los decoradores.
 */
@Injectable()
export class OrdersCronService implements OnModuleInit {
  private readonly logger = new Logger(OrdersCronService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly dispatchOrders: DispatchOrders,
    private readonly syncOrderStatuses: SyncOrderStatuses,
  ) {}

  onModuleInit(): void {
    this.register({
      name: 'orders-sync',
      scheduleEnv: 'ORDERS_SYNC_CRON',
      defaultSchedule: '0 0 */2 * * *',
      enabledEnv: 'ORDERS_SYNC_CRON_ENABLED',
      run: () => this.dispatchOrders.run(),
    });
    this.register({
      name: 'orders-status-sync',
      scheduleEnv: 'ORDERS_STATUS_CRON',
      // A la media hora, para no chocar con el sync
      defaultSchedule: '0 30 * * * *',
      enabledEnv: 'ORDERS_STATUS_CRON_ENABLED',
      run: () => this.syncOrderStatuses.run(),
    });
  }

  private register(definition: OrdersCronDefinition): void {
    if (process.env[definition.enabledEnv] === 'false') {
      this.logger.log(
        `[cron ${definition.name}] deshabilitado (${definition.enabledEnv}=false)`,
      );
      return;
    }

    const schedule = this.resolveSchedule(definition);
    const job = CronJob.from({
      cronTime: schedule,
      onTick: () => this.runSafely(definition),
      timeZone: TIME_ZONE,
    });

    this.schedulerRegistry.addCronJob(definition.name, job);
    job.start();
    this.logger.log(`[cron ${definition.name}] ${schedule} (${TIME_ZONE})`);
  }

  private resolveSchedule(definition: OrdersCronDefinition): string {
    const custom = process.env[definition.scheduleEnv]?.trim();
    if (!custom) {
      return definition.defaultSchedule;
    }

    // Un valor mal escrito no debe tirar la API: se avisa y se usa el horario por defecto
    if (!validateCronExpression(custom).valid) {
      this.logger.error(
        `[cron ${definition.name}] ${definition.scheduleEnv}="${custom}" no es una expresion cron valida: se usa ${definition.defaultSchedule}`,
      );
      return definition.defaultSchedule;
    }

    return custom;
  }

  private async runSafely(definition: OrdersCronDefinition): Promise<void> {
    try {
      await definition.run();
    } catch (error) {
      if (error instanceof DispatchInProgressError) {
        this.logger.warn(
          `[cron ${definition.name}] se omite: ya hay un proceso en curso`,
        );
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[cron ${definition.name}] fallo: ${message}`);
    }
  }
}
