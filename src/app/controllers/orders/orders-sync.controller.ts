import { Controller, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PersistMarketplaceOrders } from '../../../core/interactor/orders/PersistMarketplaceOrders';

@ApiTags('orders')
@Controller('orders')
export class OrdersSyncController {
  constructor(
    private readonly persistMarketplaceOrders: PersistMarketplaceOrders,
  ) {}

  @Cron('0 0 */2 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async handleCron() {
    await this.persistMarketplaceOrders.run();
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Dispara manualmente la ingesta de órdenes hacia madre-api',
  })
  async sync() {
    return this.persistMarketplaceOrders.run();
  }
}
