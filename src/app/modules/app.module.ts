import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [ScheduleModule.forRoot(), OrdersModule],
  controllers: [],
  // Todos los endpoints exigen x-api-key (los crons no pasan por aca)
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
