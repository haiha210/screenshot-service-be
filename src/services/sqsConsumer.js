const { Consumer } = require("sqs-consumer");
const { v4: uuidv4 } = require("uuid");
const config = require("../config");
const { sqsClient } = require("../config/aws");
const screenshotService = require("../services/screenshotService");
const s3Service = require("../services/s3Service");
const dynamodbService = require("../services/dynamodbService");
const logger = require("../utils/logger");

/**
 * Process screenshot message
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
        format: body.format || "png",
      },
      "Processing screenshot message"
    );

    // Extract screenshot parameters from message
    const {
      url,
      width,
      height,
      format = "png",
      quality = 80,
      fullPage = false,
      screenshotId: providedId,
    } = body;

    // Validate required fields
    if (!url) {
      throw new Error("URL is required in message body");
    }

    // Generate or use provided screenshot ID
    screenshotId = providedId || uuidv4();

    // Save initial record to DynamoDB
    await dynamodbService.saveScreenshotResult({
      screenshotId,
      url,
      status: "processing",
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
    const uploadResult = await s3Service.uploadFile(
      screenshot,
      s3Key,
      `image/${format}`
    );

    // Update DynamoDB with success status
    await dynamodbService.updateScreenshotStatus(screenshotId, "success", {
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
      "Screenshot processed successfully"
    );

    return {
      success: true,
      screenshotId,
      s3Url: uploadResult.url,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        err: error,
        messageId: message.MessageId,
        screenshotId,
        duration,
      },
      "Failed to process message"
    );

    // Update DynamoDB with failure status if we have an ID
    if (screenshotId) {
      try {
        await dynamodbService.updateScreenshotStatus(screenshotId, "failed", {
          errorMessage: error.message,
        });
      } catch (dbError) {
        logger.error(
          {
            err: dbError,
            screenshotId,
          },
          "Failed to update failure status in DynamoDB"
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
  });

  // Event handlers
  consumer.on("error", (err) => {
    logger.error({ err }, "SQS Consumer error");
  });

  consumer.on("processing_error", (err) => {
    logger.error({ err }, "SQS processing error");
  });

  consumer.on("timeout_error", (err) => {
    logger.error({ err }, "SQS timeout error");
  });

  consumer.on("message_received", (message) => {
    logger.debug({ messageId: message.MessageId }, "Message received from SQS");
  });

  consumer.on("message_processed", (message) => {
    logger.debug(
      { messageId: message.MessageId },
      "Message processed and deleted from queue"
    );
  });

  consumer.on("stopped", () => {
    logger.info("SQS Consumer stopped");
  });

  consumer.on("empty", () => {
    logger.trace("Queue is empty, waiting for messages");
  });

  return consumer;
}

module.exports = {
  createConsumer,
  handleMessage,
};
