export class MadreHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly response: unknown,
    message: string,
  ) {
    super(message);
  }
}
