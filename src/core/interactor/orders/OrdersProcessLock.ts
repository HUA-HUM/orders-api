import { Injectable } from '@nestjs/common';

export class DispatchInProgressError extends Error {
  constructor() {
    super('Ya hay un proceso de ordenes en curso');
  }
}

/**
 * Un solo proceso de ordenes a la vez (sync, retry o actualizacion de estados):
 * todos escriben las mismas filas de madre.
 */
@Injectable()
export class OrdersProcessLock {
  private running = false;

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) {
      throw new DispatchInProgressError();
    }

    this.running = true;
    try {
      return await fn();
    } finally {
      this.running = false;
    }
  }
}
