import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [ScheduleModule.forRoot(), OrdersModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
