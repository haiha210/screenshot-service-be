/**
 * Lambda Function: Health Check
 *
 * API Gateway endpoint: GET /health
 *
 * Response:
 * {
 *   "status": "OK",
 *   "message": "Service is healthy",
 *   "timestamp": "2025-10-19T10:30:00.000Z",
 *   "service": "screenshot-service"
 * }
 */

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
 * Lambda handler for health check
 */
exports.handler = async (event) => {
  console.log('Health check request received:', JSON.stringify(event, null, 2));

  try {
    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
      return createResponse(200, { message: 'OK' });
    }

    // Health check response
    const healthResponse = {
      status: 'OK',
      message: 'Service is healthy',
      timestamp: new Date().toISOString(),
      service: 'screenshot-service',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };

    console.log('Health check response:', healthResponse);

    return createResponse(200, healthResponse);
  } catch (error) {
    console.error('Health check error:', error);

    // Even if there's an error, we still want to return some response
    const errorResponse = {
      status: 'ERROR',
      message: 'Service health check failed',
      timestamp: new Date().toISOString(),
      service: 'screenshot-service',
      error: error.message,
    };

    return createResponse(500, errorResponse);
  }
};
