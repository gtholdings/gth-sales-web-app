import winston from 'winston';

/**
 * Application logger (Winston).
 *
 * Level is controlled by the LOG_LEVEL env var. Defaults to:
 *   - 'debug' in development
 *   - 'info'  in production
 *
 * To see the verbose troubleshooting output, set LOG_LEVEL=debug in
 * .env.local (it is the default for `npm run dev` anyway).
 *
 * On Netlify/serverless, file transports don't persist between invocations,
 * so we log to the console only — output shows up in the function logs.
 */

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const isProd = process.env.NODE_ENV === 'production';

// Human-readable, colorized output for local development.
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${message}${metaStr}`;
  })
);

// Structured JSON for production (easy to grep/parse in function logs).
const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  format: isProd ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
});

export default logger;
