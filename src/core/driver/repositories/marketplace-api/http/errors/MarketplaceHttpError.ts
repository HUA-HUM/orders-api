export class MarketplaceHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly response: unknown,
    message: string,
  ) {
    super(message);
  }
}
