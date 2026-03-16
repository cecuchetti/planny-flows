import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

/**
 * Simple in-memory rate limiter.
 * Note: This is suitable for single-instance deployments.
 * For multi-instance deployments, consider using a distributed store like Redis.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests, message = 'Too many requests, please try again later.' } = options;
  
  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries periodically (every window duration)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    store.forEach((entry, key) => {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    });
  }, windowMs);

  // Prevent the interval from keeping the process alive
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      // Create new window
      entry = {
        count: 1,
        resetAt: now + windowMs,
      };
      store.set(key, entry);
    } else {
      entry.count += 1;
    }

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetTimeSeconds = Math.ceil((entry.resetAt - now) / 1000);

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetTimeSeconds.toString());

    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', resetTimeSeconds.toString());
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: resetTimeSeconds,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Pre-configured rate limiter for Tempo export endpoints.
 * Limits to 10 requests per minute per IP.
 */
export const tempoExportRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many Tempo export requests. Please wait before trying again.',
});
