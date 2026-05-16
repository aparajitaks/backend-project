import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

export { logger };

/**
 * Pino HTTP middleware.
 *
 * Logs every request with:
 *  - method
 *  - url / path
 *  - statusCode
 *  - responseTime (ms)
 *  - content-length
 *
 * The `req.log` and `res.log` instances are bound to the per-request
 * child logger so correlation IDs can be added later.
 */
export const requestLogger = pinoHttp({
  logger,
  // Custom serializer: only expose safe, non-PII fields
  customReceivedMessage: () => 'request received',
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (_req, _res, err) =>
    `request failed: ${err.message}`,
  // Redact sensitive headers before they reach the log sink
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[REDACTED]',
  },
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
