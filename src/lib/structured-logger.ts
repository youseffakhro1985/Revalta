type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|session|database[_-]?url|direct[_-]?url)/i;

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "production" ? undefined : value.stack,
    };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : sanitizeValue(nested, depth + 1, seen),
      ]),
    );
  }
  return String(value);
}

export function sanitizeLogContext(context: LogContext = {}): LogContext {
  return sanitizeValue(context) as LogContext;
}

export function serializeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return sanitizeLogContext({
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      },
    });
  }
  return sanitizeLogContext({ error });
}

export function createLogger(baseContext: LogContext = {}) {
  const base = sanitizeLogContext(baseContext);

  function write(level: LogLevel, message: string, context: LogContext = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: "revalta",
      message,
      ...base,
      ...sanitizeLogContext(context),
    };
    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "debug") console.debug(line);
    else console.info(line);
  }

  return {
    debug: (message: string, context?: LogContext) => write("debug", message, context),
    info: (message: string, context?: LogContext) => write("info", message, context),
    warn: (message: string, context?: LogContext) => write("warn", message, context),
    error: (message: string, error?: unknown, context: LogContext = {}) =>
      write("error", message, { ...context, ...serializeError(error) }),
  };
}
