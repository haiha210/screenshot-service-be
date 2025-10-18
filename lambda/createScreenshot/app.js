/**
 * Lambda Function: Create Screenshot
 *
 * API Gateway endpoint: POST /screenshots
 *
 * Request body:
 * {
 *   "url": "https://example.com",
 *   "width": 1920,      // optional, default 1920
 *   "height": 1080,     // optional, default 1080
 *   "format": "png",    // optional, default "png", can be "jpeg"
 *   "quality": 80,      // optional, default 80 (for jpeg)
 *   "fullPage": false   // optional, default false
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "requestId": "uuid-123",
 *   "message": "Screenshot request created",
 *   "status": "processing"
 * }
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS clients
const clientConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT && {
    endpoint: process.env.AWS_ENDPOINT,
    // For LocalStack, disable SSL and use path-style addressing
    tls: false,
    forcePathStyle: true,
  }),
};

const dynamoDBClient = new DynamoDBClient(clientConfig);
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);
const sqsClient = new SQSClient(clientConfig);

// Configuration
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE_NAME || 'screenshot-results';
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

// Default values
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FORMAT = 'png';
const DEFAULT_QUALITY = 80;
const DEFAULT_FULL_PAGE = false;

/**
 * Validate URL
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }

  // Check if URL is too long
  if (url.length > 2048) {
    return { valid: false, error: 'URL is too long (max 2048 characters)' };
  }

  // Basic URL validation
  try {
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    if (!urlPattern.test(normalizedUrl)) {
      return { valid: false, error: 'Invalid URL format' };
    }
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }

  return { valid: true };
}

/**
 * Validate request parameters
 */
function validateRequest(body) {
  const errors = [];

  // Validate URL
  const urlValidation = validateUrl(body.url);
  if (!urlValidation.valid) {
    errors.push(urlValidation.error);
  }

  // Validate width
  if (body.width !== undefined) {
    const width = parseInt(body.width);
    if (isNaN(width) || width < 100 || width > 3840) {
      errors.push('Width must be between 100 and 3840 pixels');
    }
  }

  // Validate height
  if (body.height !== undefined) {
    const height = parseInt(body.height);
    if (isNaN(height) || height < 100 || height > 2160) {
      errors.push('Height must be between 100 and 2160 pixels');
    }
  }

  // Validate format
  if (body.format !== undefined && !['png', 'jpeg'].includes(body.format)) {
    errors.push('Format must be either "png" or "jpeg"');
  }

  // Validate quality
  if (body.quality !== undefined) {
    const quality = parseInt(body.quality);
    if (isNaN(quality) || quality < 0 || quality > 100) {
      errors.push('Quality must be between 0 and 100');
    }
  }

  // Validate fullPage
  if (body.fullPage !== undefined && typeof body.fullPage !== 'boolean') {
    errors.push('fullPage must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create response object
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
      return createResponse(200, { message: 'OK' });
    }

    // Parse request body
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (error) {
      return createResponse(400, {
        success: false,
        error: 'Invalid JSON in request body',
      });
    }

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return createResponse(400, {
        success: false,
        errors: validation.errors,
      });
    }

    // Normalize URL (add https:// if missing)
    let url = body.url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    // Generate request ID
    const requestId = uuidv4();
    const timestamp = new Date().toISOString();

    // Extract parameters with defaults
    const width = body.width !== undefined ? parseInt(body.width) : DEFAULT_WIDTH;
    const height = body.height !== undefined ? parseInt(body.height) : DEFAULT_HEIGHT;
    const format = body.format || DEFAULT_FORMAT;
    const quality = body.quality !== undefined ? parseInt(body.quality) : DEFAULT_QUALITY;
    const fullPage = body.fullPage !== undefined ? body.fullPage : DEFAULT_FULL_PAGE;

    // Step 1: Create DynamoDB record with 'processing' status
    console.log('Creating DynamoDB record...', { requestId, url });

    const dynamoDBItem = {
      id: requestId,
      url: url,
      status: 'processing',
      width: width,
      height: height,
      format: format,
      quality: quality,
      fullPage: fullPage,
      s3Url: null,
      s3Key: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      const putCommand = new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: dynamoDBItem,
      });

      await dynamoDBDocClient.send(putCommand);
      console.log('DynamoDB record created successfully');
    } catch (dbError) {
      console.error('Failed to create DynamoDB record:', dbError);
      return createResponse(500, {
        success: false,
        error: 'Failed to create screenshot record',
        details: dbError.message,
      });
    }

    // Step 2: Send message to SQS queue
    console.log('Sending message to SQS...', { requestId });

    const sqsMessage = {
      url: url,
      width: width,
      height: height,
      format: format,
      quality: quality,
      fullPage: fullPage,
      requestId: requestId,
    };

    try {
      const sendCommand = new SendMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MessageBody: JSON.stringify(sqsMessage),
      });

      const sqsResponse = await sqsClient.send(sendCommand);
      console.log('SQS message sent successfully:', sqsResponse.MessageId);
    } catch (sqsError) {
      console.error('Failed to send SQS message:', sqsError);

      // Try to update DynamoDB record to failed status
      try {
        await dynamoDBDocClient.send(
          new UpdateCommand({
            TableName: DYNAMODB_TABLE,
            Key: { id: requestId },
            UpdateExpression:
              'SET #status = :status, errorMessage = :error, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':status': 'failed',
              ':error': `Failed to queue message: ${sqsError.message}`,
              ':updatedAt': new Date().toISOString(),
            },
          })
        );
      } catch (updateError) {
        console.error('Failed to update DynamoDB record to failed:', updateError);
      }

      return createResponse(500, {
        success: false,
        error: 'Failed to queue screenshot request',
        details: sqsError.message,
      });
    }

    // Success response
    return createResponse(201, {
      success: true,
      requestId: requestId,
      message: 'Screenshot request created successfully',
      status: 'processing',
      checkStatusUrl: `/screenshots/${requestId}`,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return createResponse(500, {
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
};
