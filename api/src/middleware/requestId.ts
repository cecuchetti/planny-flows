import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function addRequestId(headerName = 'x-request-id'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const existingId = req.headers[headerName];
    req.requestId = typeof existingId === 'string' && existingId 
      ? existingId 
      : `req_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    
    if (!existingId) {
      req.headers[headerName] = req.requestId;
    }
    
    next();
  };
}
