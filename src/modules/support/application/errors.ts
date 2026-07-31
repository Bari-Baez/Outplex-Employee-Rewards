export class SupportApplicationError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 429 | 500,
    public readonly publicMessage: string,
    public readonly code: string,
  ) {
    super(publicMessage);
    this.name = 'SupportApplicationError';
  }
}
