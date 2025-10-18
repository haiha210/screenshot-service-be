const { Consumer } = require('sqs-consumer');
const config = require('../config');
const { sqsClient } = require('../config/aws');
const screenshotService = require('../services/screenshotService');
const s3Service = require('../services/s3Service');
const dynamodbService = require('../services/dynamodbService');
const logger = require('../utils/logger');

/**
 * Process screenshot message
 *
 * Flow:
 * 1. Parse message body and extract screenshot parameters
 * 2. Check if screenshot already exists and is successful (skip if already processed)
 * 3. Check if screenshot is being processed (not stale) by another instance (skip)
 * 4. Update DynamoDB record to 'consumerProcessing' status - consumer is actively working
 * 5. Capture screenshot using Puppeteer
 * 6. Upload screenshot to S3
 * 7. Update DynamoDB with 'success' status
 * 8. Return success (message will be automatically deleted from SQS)
 *
 * Note: The initial 'processing' record is created when message is sent to SQS
 *
 * Status flow:
 * - processing: Message sent to SQS, waiting for consumer
 * - consumerProcessing: Consumer actively processing the request
 * - success: Screenshot captured and uploaded successfully
 * - failed: Error occurred during processing
 *
 * On error:
 * - Update DynamoDB with 'failed' status
 * - Re-throw error to let SQS retry (message not deleted)
 *
 * @param {Object} message - SQS message
 */
async function handleMessage(message) {
  let screenshotId = null;
  const startTime = Date.now();

  try {
    const body = JSON.parse(message.Body);
    logger.info(
      {
        messageId: message.MessageId,
        url: body.url,
        format: body.format || 'png',
      },
      'Processing screenshot message'
    );

    // Extract screenshot parameters from message
    const { url, width, height, format = 'png', quality = 80, fullPage = false, requestId } = body;

    // Validate required fields
    if (!url) {
      throw new Error('URL is required in message body');
    }

    screenshotId = requestId;

    // Check if this screenshot already exists and is successful
    const existingScreenshot = await dynamodbService.getScreenshot(screenshotId);

    if (!existingScreenshot) {
      // This should not happen - record should have been created when message was sent
      logger.warn(
        {
          screenshotId,
          url,
        },
        'Screenshot record not found in DynamoDB - this is unexpected'
      );
      // Create the record now as fallback
      await dynamodbService.saveScreenshotResult({
        screenshotId,
        url,
        status: 'processing',
        width: width || config.screenshot.defaultWidth,
        height: height || config.screenshot.defaultHeight,
        format,
      });
    } else if (existingScreenshot.status === 'success') {
      logger.info(
        {
          screenshotId,
          url,
          status: existingScreenshot.status,
          s3Url: existingScreenshot.s3Url,
        },
        'Screenshot already processed successfully, skipping (message will be deleted)'
      );
      return;
    }

    // If already being actively processed by consumer (consumerProcessing), check if stale
    if (existingScreenshot && existingScreenshot.status === 'consumerProcessing') {
      // Check if processing has been going on for too long (stale record)
      const processingStartTime = new Date(
        existingScreenshot.updatedAt || existingScreenshot.createdAt
      );
      const now = new Date();
      const processingDurationMs = now - processingStartTime;
      const maxProcessingTimeMs = 10 * 60 * 1000; // 10 minutes

      if (processingDurationMs > maxProcessingTimeMs) {
        logger.warn(
          {
            screenshotId,
            url,
            processingDurationMs,
            maxProcessingTimeMs,
            startedAt: processingStartTime.toISOString(),
            currentStatus: existingScreenshot.status,
          },
          'Screenshot processing appears stale, will retry'
        );
        // Continue processing (don't skip)
      } else {
        logger.info(
          {
            screenshotId,
            url,
            status: existingScreenshot.status,
            processingDurationMs,
          },
          'Screenshot is being actively processed by another consumer, skipping'
        );
        return;
      }
    }

    // Update DynamoDB to 'consumerProcessing' status
    // This shows this consumer instance is now actively handling the request
    await dynamodbService.updateScreenshotStatus(screenshotId, 'consumerProcessing', {
      width: width || config.screenshot.defaultWidth,
      height: height || config.screenshot.defaultHeight,
      format,
    });

    // Capture screenshot
    const screenshot = await screenshotService.captureScreenshot({
      url,
      width,
      height,
      format,
      quality,
      fullPage,
    });

    // Generate S3 key and upload
    const s3Key = s3Service.generateScreenshotKey(url, screenshotId, format);
    const uploadResult = await s3Service.uploadFile(screenshot, s3Key, `image/${format}`);

    // Update DynamoDB with success status
    await dynamodbService.updateScreenshotStatus(screenshotId, 'success', {
      s3Url: uploadResult.url,
      s3Key: uploadResult.key,
    });

    const duration = Date.now() - startTime;
    logger.info(
      {
        screenshotId,
        url,
        s3Url: uploadResult.url,
        messageId: message.MessageId,
        duration,
      },
      'Screenshot processed successfully (message will be deleted)'
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        err: error,
        messageId: message.MessageId,
        screenshotId,
        duration,
      },
      'Failed to process message'
    );

    // Update DynamoDB with failure status if we have an ID
    if (screenshotId) {
      try {
        await dynamodbService.updateScreenshotStatus(screenshotId, 'failed', {
          errorMessage: error.message,
        });
      } catch (dbError) {
        logger.error(
          {
            err: dbError,
            screenshotId,
          },
          'Failed to update failure status in DynamoDB'
        );
      }
    }

    // Re-throw error to let SQS handle retry
    throw error;
  }
}

/**
 * Create and configure SQS consumer
 */
function createConsumer() {
  const consumer = Consumer.create({
    queueUrl: config.sqs.queueUrl,
    handleMessage,
    sqs: sqsClient,
    batchSize: config.sqs.batchSize,
    visibilityTimeout: config.sqs.visibilityTimeout,
    waitTimeSeconds: config.sqs.waitTimeSeconds,
    // Automatically delete messages after successful processing
    shouldDeleteMessages: true,
  });

  // Event handlers
  consumer.on('error', (err) => {
    logger.error({ err }, 'SQS Consumer error');
  });

  consumer.on('processing_error', (err) => {
    logger.error({ err }, 'SQS processing error');
  });

  consumer.on('timeout_error', (err) => {
    logger.error({ err }, 'SQS timeout error');
  });

  consumer.on('message_received', (message) => {
    logger.debug({ messageId: message.MessageId }, 'Message received from SQS');
  });

  consumer.on('stopped', () => {
    logger.info('SQS Consumer stopped');
  });

  consumer.on('empty', () => {
    logger.trace('Queue is empty, waiting for messages');
  });

  return consumer;
}

module.exports = {
  createConsumer,
  handleMessage,
};
