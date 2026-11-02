export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function parsePositiveInteger(value: unknown, fieldName: string): number {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`${fieldName} is required`, 400);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
}

export function parseBooleanField(value: unknown, fieldName: string): boolean {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`${fieldName} is required`, 400);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  throw new AppError(`${fieldName} must be true or false`, 400);
}
