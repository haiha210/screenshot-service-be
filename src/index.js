const config = require('./config');
const { createConsumer } = require('./services/sqsConsumer');
const screenshotService = require('./services/screenshotService');
const HealthCheckService = require('./services/healthCheckService');
const logger = require('./utils/logger');

// Handle graceful shutdown
let isShuttingDown = false;
let consumer = null;
let healthCheckService = null;

async function shutdown(signal) {
  if (isShuttingDown) return;

  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop SQS consumer
    if (consumer) {
      consumer.stop();
      logger.info('SQS consumer stopped');
    }

    // Stop health check server
    if (healthCheckService) {
      await healthCheckService.stop();
    }

    // Close Puppeteer browser
    await screenshotService.closeBrowser();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error({ err: error, message: error.message, stack: error.stack }, 'Uncaught exception');
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(
    { reason, promise, message: reason?.message, stack: reason?.stack },
    'Unhandled rejection'
  );
  shutdown('unhandledRejection');
});

async function startService() {
  try {
    logger.info('Starting Screenshot Service...');
    logger.info('Configuration:', {
      nodeEnv: config.app.nodeEnv,
      queueUrl: config.sqs.queueUrl,
      s3Bucket: config.s3.bucketName,
      dynamodbTable: config.dynamodb.tableName,
      region: config.aws.region,
      healthCheckPort: config.healthCheck.port,
    });

    // Start health check server
    healthCheckService = new HealthCheckService();
    await healthCheckService.start();

    // Initialize Puppeteer browser
    await screenshotService.initBrowser();

    // Create and start SQS consumer
    consumer = createConsumer();
    consumer.start();

    logger.info('Screenshot Service started successfully');
    logger.info('Listening for messages from SQS...');
  } catch (error) {
    logger.error(
      { err: error, message: error.message, stack: error.stack },
      'Failed to start service'
    );
    process.exit(1);
  }
}

// Start the service
startService();
