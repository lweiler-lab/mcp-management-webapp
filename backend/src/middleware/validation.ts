import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import Logger from '@/utils/logger';

/**
 * Express-validator middleware for handling validation errors
 * 
 * Processes validation results from express-validator rules
 * and returns standardized error responses
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined
    }));

    Logger.security('Validation failed', {
      request_id: req.requestId,
      user_id: (req as any).user?.id,
      url: req.originalUrl,
      method: req.method,
      validation_errors: errorDetails,
      client_ip: req.clientIP
    });

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: 'The request contains invalid data',
      validation_errors: errorDetails,
      requestId: req.requestId
    });
    return;
  }

  next();
};

export default validateRequest;