import { Controller, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DispatchOrders } from '../../../core/interactor/orders/DispatchOrders';

@ApiTags('orders')
@Controller('orders')
export class OrdersSyncController {
  constructor(private readonly dispatchOrders: DispatchOrders) {}

  @Cron('0 0 */2 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async handleCron() {
    await this.dispatchOrders.run();
  }

  @Post('sync')
  @ApiOperation({
    summary:
      'Dispara manualmente el flujo de ordenes: Flokzu -> PowerApps -> persistencia',
  })
  async sync() {
    return this.dispatchOrders.run();
  }
}
