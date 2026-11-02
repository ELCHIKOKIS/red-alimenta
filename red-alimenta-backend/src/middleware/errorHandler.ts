import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  if (err instanceof Error) {
    console.error('Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }

  console.error('Unknown error:', err);
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
}
