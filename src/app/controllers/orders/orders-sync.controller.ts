import {
  BadRequestException,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  DispatchInProgressError,
  DispatchOrderNotFoundError,
  DispatchOrderNotRetryableError,
  DispatchOrders,
} from '../../../core/interactor/orders/DispatchOrders';
import type { DispatchRange } from '../../../core/interactor/orders/DispatchOrders';
import { SyncOrderStatuses } from '../../../core/interactor/orders/SyncOrderStatuses';

@ApiTags('orders')
@Controller('orders')
export class OrdersSyncController {
  constructor(
    private readonly dispatchOrders: DispatchOrders,
    private readonly syncOrderStatuses: SyncOrderStatuses,
  ) {}

  @Post('sync')
  @ApiOperation({
    summary: 'Dispara manualmente el flujo de ordenes: madre -> VBI',
    description:
      'Sin parametros procesa las ordenes nuevas desde el ultimo sync. ' +
      'Con from/to reprocesa ese rango de fechas de compra (las que ya estan en madre se saltean).',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Fecha de compra desde (ISO-8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Fecha de compra hasta (ISO-8601)',
  })
  async sync(@Query('from') from?: string, @Query('to') to?: string) {
    const range = this.parseRange(from, to);

    try {
      return await this.dispatchOrders.run(range);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Post('status-sync')
  @ApiOperation({
    summary:
      'Actualiza el estado de las ordenes PENDING de madre segun Fravega',
    description:
      'Las entregadas pasan a COMPLETED. Las canceladas o devueltas tambien quedan COMPLETED ' +
      '(madre no acepta CANCELLED) con last_error "[CANCELLED] ...". ' +
      'A las ya enviadas a VBI sin numero TLQV se lo completa en floxu_code (reenvio que VBI responde como duplicate).',
  })
  async statusSync() {
    try {
      return await this.syncOrderStatuses.run();
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Post('retry/:uniqueKey')
  @ApiOperation({
    summary:
      'Reintenta una orden FAILED: la vuelve a consultar y la reenvia a VBI',
    description:
      'Si VBI la acepta queda PENDING (o COMPLETED si ya fue entregada). ' +
      'Si en Fravega ya esta cancelada no se envia a VBI.',
  })
  @ApiParam({ name: 'uniqueKey', example: 'fravega:v93713051frvg-01' })
  async retry(@Param('uniqueKey') uniqueKey: string) {
    try {
      return await this.dispatchOrders.retry(uniqueKey);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private parseRange(from?: string, to?: string): DispatchRange | undefined {
    if (!from && !to) {
      return undefined;
    }

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    if (
      !fromDate ||
      !toDate ||
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime())
    ) {
      throw new BadRequestException(
        'Enviar from y to juntos, en formato ISO-8601.',
      );
    }

    if (fromDate >= toDate) {
      throw new BadRequestException('from debe ser anterior a to.');
    }

    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }

  private mapError(error: unknown): unknown {
    if (error instanceof DispatchInProgressError) {
      return new ConflictException(error.message);
    }
    if (error instanceof DispatchOrderNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (error instanceof DispatchOrderNotRetryableError) {
      return new BadRequestException(error.message);
    }
    return error;
  }
}
