import { Module } from '@nestjs/common';
import { I_GET_FRAVEGA_ORDERS_REPOSITORY } from '../../../core/adapters/repositories/marketplace/fravega/orders/IGetFravegaOrdersRepository';
import { I_GET_MEGATONE_ORDERS_REPOSITORY } from '../../../core/adapters/repositories/marketplace/megatone/orders/IGetMegatoneOrdersRepository';
import { I_GET_ONCITY_ORDERS_REPOSITORY } from '../../../core/adapters/repositories/marketplace/oncity/orders/IGetOncityOrdersRepository';
import { GetFravegaOrdersRepository } from '../../../core/driver/repositories/marketplace-api/fravega/orders/GetFravegaOrdersRepository';
import { MarketplaceHttpClient } from '../../../core/driver/repositories/marketplace-api/http/MarketplaceHttpClient';
import { GetMegatoneOrdersRepository } from '../../../core/driver/repositories/marketplace-api/megatone/orders/GetMegatoneOrdersRepository';
import { GetOncityOrdersRepository } from '../../../core/driver/repositories/marketplace-api/oncity/orders/GetOncityOrdersRepository';
import { I_ORDERS_PERSISTENCE_REPOSITORY } from '../../../core/adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import { MadreHttpClient } from '../../../core/driver/repositories/madre-api/http/MadreHttpClient';
import { OrdersPersistenceRepository } from '../../../core/driver/repositories/madre-api/orders/OrdersPersistenceRepository';
import { OrdersInteractor } from '../../../core/interactor/orders/OrdersInteractor';
import { OrdersController } from '../../controllers/orders/orders.controller';
import { OrdersService } from '../../services/orders/orders.service';

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrdersInteractor,
    MarketplaceHttpClient,
    MadreHttpClient,
    {
      provide: I_ORDERS_PERSISTENCE_REPOSITORY,
      useClass: OrdersPersistenceRepository,
    },
    {
      provide: I_GET_MEGATONE_ORDERS_REPOSITORY,
      useClass: GetMegatoneOrdersRepository,
    },
    {
      provide: I_GET_ONCITY_ORDERS_REPOSITORY,
      useClass: GetOncityOrdersRepository,
    },
    {
      provide: I_GET_FRAVEGA_ORDERS_REPOSITORY,
      useClass: GetFravegaOrdersRepository,
    },
  ],
})
export class OrdersModule {}
