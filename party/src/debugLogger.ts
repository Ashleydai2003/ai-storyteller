/**
 * Debug Logger - Stores console logs in memory for HTTP access.
 *
 * This logger wraps console.log/info/warn/error and stores the messages
 * in memory so they can be accessed via HTTP endpoint.
 */

export interface DebugLogEntry {
  timestamp: string;
  level: "log" | "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

export class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs

  /**
   * Get all debug logs.
   */
  getLogs(): DebugLogEntry[] {
    return this.logs;
  }

  /**
   * Clear all debug logs.
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Log a debug message.
   */
  log(message: string, data?: unknown) {
    console.log(message, data);
    this.addLog("log", message, data);
  }

  /**
   * Log an info message.
   */
  info(message: string, data?: unknown) {
    console.info(message, data);
    this.addLog("info", message, data);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, data?: unknown) {
    console.warn(message, data);
    this.addLog("warn", message, data);
  }

  /**
   * Log an error message.
   */
  error(message: string, data?: unknown) {
    console.error(message, data);
    this.addLog("error", message, data);
  }

  /**
   * Add a log entry to the in-memory store.
   */
  private addLog(level: "log" | "info" | "warn" | "error", message: string, data?: unknown) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    });

    // Trim to max size
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }
}
