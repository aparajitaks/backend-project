import rateLimit from 'express-rate-limit';

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per `window`
  standardHeaders: false, // Disable the `RateLimit-*` headers
  legacyHeaders: true, // Enable the `X-RateLimit-*` headers
  handler: (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resetTime = (req as any).rateLimit?.resetTime as Date | undefined;
    const retryAfter = resetTime ? Math.ceil((resetTime.getTime() - Date.now()) / 1000) : 60;
    
    res.status(429).json({
      success: false,
      error: `Too many uploads. Try again in ${retryAfter} seconds.`,
      retryAfter,
    });
  },
});
