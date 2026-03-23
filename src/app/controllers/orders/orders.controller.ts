import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { OrdersQuery } from '../../../core/entitis/orders/Orders';
import { OrdersService } from '../../services/orders/orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'Overview de órdenes de las últimas 24 horas',
  })
  @ApiOkResponse({
    description: 'Devuelve órdenes agregadas y resumen por marketplace.',
  })
  @Get('overview/last-24-hours')
  getLast24HoursOverview() {
    return this.ordersService.getLast24HoursOverview();
  }

  @ApiOperation({
    summary: 'Overview de órdenes recientes por ventana de horas',
  })
  @ApiParam({
    name: 'hours',
    enum: [24, 48, 72],
    description: 'Ventana horaria permitida',
  })
  @ApiOkResponse({
    description:
      'Devuelve órdenes agregadas y resumen por marketplace para 24h, 48h o 72h.',
  })
  @Get('overview/recent/:hours')
  getRecentHoursOverview(@Param('hours', ParseIntPipe) hours: number) {
    return this.ordersService.getRecentHoursOverview(hours);
  }

  @ApiOperation({
    summary: 'Overview histórico desde el 1 de enero de 2026 hasta ahora',
  })
  @ApiOkResponse({
    description:
      'Devuelve órdenes agregadas y resumen histórico por marketplace.',
  })
  @Get('overview/historical')
  getHistoricalOverview() {
    return this.ordersService.getHistoricalOverview();
  }

  @ApiOperation({
    summary: 'Obtiene órdenes de todos los marketplaces para un rango dado',
  })
  @ApiQuery({
    name: 'fechaDesde',
    required: false,
    description: 'Fecha inicial ISO-8601. Alternativa: from',
    example: '2026-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'fechaHasta',
    required: false,
    description: 'Fecha final ISO-8601. Alternativa: to',
    example: '2026-01-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Alias de fechaDesde',
    example: '2026-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Alias de fechaHasta',
    example: '2026-01-31T23:59:59.999Z',
  })
  @ApiOkResponse({
    description: 'Devuelve las órdenes combinadas de todos los marketplaces.',
  })
  @Get()
  getAllOrders(@Query() query: OrdersQuery) {
    return this.ordersService.getAllMarketplaceOrders(query);
  }

  @ApiOperation({
    summary: 'Obtiene órdenes de un marketplace específico para un rango dado',
  })
  @ApiParam({
    name: 'marketplace',
    enum: ['megatone', 'oncity', 'fravega'],
    description: 'Marketplace a consultar',
  })
  @ApiQuery({
    name: 'fechaDesde',
    required: false,
    description: 'Fecha inicial ISO-8601. Alternativa: from',
    example: '2026-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'fechaHasta',
    required: false,
    description: 'Fecha final ISO-8601. Alternativa: to',
    example: '2026-01-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Alias de fechaDesde',
    example: '2026-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Alias de fechaHasta',
    example: '2026-01-31T23:59:59.999Z',
  })
  @ApiOkResponse({
    description: 'Devuelve las órdenes del marketplace solicitado.',
  })
  @Get(':marketplace')
  getMarketplaceOrders(
    @Param('marketplace') marketplace: string,
    @Query() query: OrdersQuery,
  ) {
    return this.ordersService.getMarketplaceOrders(marketplace, query);
  }
}
