type Level = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  ts: string;
  level: Level;
  msg: string;
  tool?: string;
  durationMs?: number;
  data?: Record<string, unknown>;
};

function emit(record: LogRecord): void {
  process.stderr.write(`${JSON.stringify(record)}\n`);
}

export function log(level: Level, msg: string, data?: Record<string, unknown>): void {
  const record: LogRecord = { ts: new Date().toISOString(), level, msg };
  if (data) record.data = data;
  emit(record);
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data)
};

export async function withToolLog<T>(
  tool: string,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  logger.info("tool.start", { tool });
  try {
    const result = await fn();
    logger.info("tool.ok", { tool, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    logger.error("tool.fail", {
      tool,
      durationMs: Date.now() - started,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
