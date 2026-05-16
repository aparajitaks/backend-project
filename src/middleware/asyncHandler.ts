import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler so that any rejected promise or thrown
 * error is forwarded to `next()`, triggering the global error handler.
 *
 * This eliminates the need for `try/catch` blocks inside controllers.
 *
 * @example
 * router.get('/items', asyncHandler(async (req, res) => {
 *   const items = await itemService.findAll();
 *   res.json(items);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
