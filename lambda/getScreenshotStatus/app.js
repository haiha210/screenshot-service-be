/**
 * Lambda Function: Get Screenshot Status
 *
 * API Gateway endpoint: GET /screenshots/{requestId}
 *
 * Path parameters:
 * - requestId: The UUID of the screenshot request
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid-123",
 *     "url": "https://example.com",
 *     "status": "success",
 *     "s3Url": "https://s3.amazonaws.com/...",
 *     "width": 1920,
 *     "height": 1080,
 *     "format": "png",
 *     "createdAt": "2024-01-01T00:00:00.000Z",
 *     "updatedAt": "2024-01-01T00:00:10.000Z"
 *   }
 * }
 *
 * Status values:
 * - processing: Message sent to SQS, waiting for consumer
 * - consumerProcessing: Consumer is actively processing
 * - success: Screenshot completed successfully
 * - failed: Error occurred during processing
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

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

// Configuration
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE_NAME || 'screenshot-results';

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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
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

    // Get requestId from path parameters
    const requestId = event.pathParameters?.requestId;

    if (!requestId) {
      return createResponse(400, {
        success: false,
        error: 'requestId is required in path',
      });
    }

    // Validate UUID format
    if (!isValidUUID(requestId)) {
      return createResponse(400, {
        success: false,
        error: 'Invalid requestId format (must be a valid UUID)',
      });
    }

    // Get screenshot record from DynamoDB
    console.log('Fetching screenshot record...', { requestId });

    try {
      const getCommand = new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { id: requestId },
      });

      const result = await dynamoDBDocClient.send(getCommand);

      if (!result.Item) {
        return createResponse(404, {
          success: false,
          error: 'Screenshot request not found',
          requestId: requestId,
        });
      }

      // Format response based on status
      const screenshot = result.Item;
      const responseData = {
        id: screenshot.id,
        url: screenshot.url,
        status: screenshot.status,
        width: screenshot.width,
        height: screenshot.height,
        format: screenshot.format,
        createdAt: screenshot.createdAt,
        updatedAt: screenshot.updatedAt,
      };

      // Add status-specific fields
      if (screenshot.status === 'success') {
        responseData.s3Url = screenshot.s3Url;
        responseData.s3Key = screenshot.s3Key;
      }

      if (screenshot.status === 'failed') {
        responseData.errorMessage = screenshot.errorMessage;
      }

      // Add processing duration if available
      if (screenshot.createdAt && screenshot.updatedAt) {
        const startTime = new Date(screenshot.createdAt);
        const endTime = new Date(screenshot.updatedAt);
        const durationMs = endTime - startTime;
        responseData.processingDurationMs = durationMs;
      }

      // Add helpful message based on status
      let message = '';
      switch (screenshot.status) {
        case 'processing':
          message = 'Screenshot request is queued and waiting for processing';
          break;
        case 'consumerProcessing':
          message = 'Screenshot is being actively processed';
          break;
        case 'success':
          message = 'Screenshot completed successfully';
          break;
        case 'failed':
          message = 'Screenshot processing failed';
          break;
        default:
          message = 'Unknown status';
      }

      return createResponse(200, {
        success: true,
        message: message,
        data: responseData,
      });
    } catch (dbError) {
      console.error('DynamoDB error:', dbError);
      return createResponse(500, {
        success: false,
        error: 'Failed to retrieve screenshot record',
        details: dbError.message,
      });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return createResponse(500, {
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
};
