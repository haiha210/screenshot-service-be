const pino = require("pino");

const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL || "info";

// Pino configuration
const logger = pino({
  level: logLevel,
  // Pretty print in development for better readability
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  // Add base fields
  base: {
    service: "screenshot-service",
    env: process.env.NODE_ENV || "production",
  },
  // Custom formatters
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  // Timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
