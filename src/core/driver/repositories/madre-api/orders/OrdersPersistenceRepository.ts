import { Injectable, Logger } from '@nestjs/common';
import type { IOrdersPersistenceRepository } from '../../../../adapters/repositories/madre/orders/IOrdersPersistenceRepository';
import type { NormalizedOrder } from '../../../../entitis/orders/Orders';
import type {
  FindOrderResponse,
  InsertOrdersResponse,
  UpdateOrderStatusRequest,
  UpdateOrderStatusResponse,
} from '../../../../entitis/madre-api/orders/OrdersPersistenceResponse';
import { MadreHttpClient } from '../http/MadreHttpClient';
import { MadreHttpError } from '../http/errors/MadreHttpError';
import { toNormalizedOrderRequest } from './mappers/toNormalizedOrderRequest';

@Injectable()
export class OrdersPersistenceRepository
  implements IOrdersPersistenceRepository
{
  private static readonly BASE_PATH = '/api/orders';
  private static readonly BATCH_CHUNK_SIZE = 25;
  private readonly logger = new Logger(OrdersPersistenceRepository.name);

  constructor(private readonly http: MadreHttpClient) {}

  async insert(orders: NormalizedOrder[]): Promise<InsertOrdersResponse> {
    const path = `${OrdersPersistenceRepository.BASE_PATH}/batch`;
    const mapped = orders.map(toNormalizedOrderRequest);
    const chunks = this.chunk(
      mapped,
      OrdersPersistenceRepository.BATCH_CHUNK_SIZE,
    );

    const result: InsertOrdersResponse = {
      status: 'ok',
      total: 0,
      inserted: 0,
      skipped: 0,
    };

    try {
      for (const batch of chunks) {
        const response = await this.http.post<InsertOrdersResponse>(path, {
          orders: batch,
        });
        result.total += response.total;
        result.inserted += response.inserted;
        result.skipped += response.skipped;
      }

      return result;
    } catch (error) {
      this.logError('insert', path, error);
      throw error;
    }
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  async findByUniqueKey(uniqueKey: string): Promise<FindOrderResponse> {
    const path = `${OrdersPersistenceRepository.BASE_PATH}/${encodeURIComponent(uniqueKey)}`;

    try {
      return await this.http.get<FindOrderResponse>(path);
    } catch (error) {
      this.logError('findByUniqueKey', path, error);
      throw error;
    }
  }

  async updateStatus(
    id: number,
    data: UpdateOrderStatusRequest,
  ): Promise<UpdateOrderStatusResponse> {
    const path = `${OrdersPersistenceRepository.BASE_PATH}/${id}/status`;

    try {
      return await this.http.patch<UpdateOrderStatusResponse>(path, data);
    } catch (error) {
      this.logError('updateStatus', path, error);
      throw error;
    }
  }

  private logError(operation: string, path: string, error: unknown): void {
    if (error instanceof MadreHttpError) {
      this.logger.error(
        `[MADRE ${operation}] ${path} -> ${error.statusCode}`,
        JSON.stringify(error.response),
      );
      return;
    }

    const message =
      error instanceof Error ? error.message : 'Unexpected madre error';
    this.logger.error(`[MADRE ${operation}] ${path} -> ${message}`);
  }
}
