const express = require('express');
const config = require('../config');
const logger = require('../utils/logger');

class HealthCheckService {
  constructor() {
    this.app = express();
    this.server = null;
    this.setupRoutes();
  }

  setupRoutes() {
    // Simple health check endpoint - always returns 200 OK
    this.app.get(config.healthCheck.path, (req, res) => {
      res.status(200).json({ message: 'ok' });
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(config.healthCheck.port, () => {
          logger.info(`Health check server started on port ${config.healthCheck.port}`);
          logger.info(
            `Health check endpoint: http://localhost:${config.healthCheck.port}${config.healthCheck.path}`
          );
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Health check server error:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start health check server:', error);
        reject(error);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Health check server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = HealthCheckService;
