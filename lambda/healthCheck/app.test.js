const { handler } = require('./app');

describe('Health Check Lambda Function', () => {
  test('should return OK status for GET request', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/health',
      headers: {
        'Content-Type': 'application/json',
      },
      body: null,
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.status).toBe('OK');
    expect(body.message).toBe('Service is healthy');
    expect(body.service).toBe('screenshot-service');
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBe('1.0.0');
  });

  test('should handle OPTIONS request for CORS', async () => {
    const event = {
      httpMethod: 'OPTIONS',
      path: '/health',
      headers: {
        'Content-Type': 'application/json',
      },
      body: null,
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
  });

  test('should include correct CORS headers', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/health',
      headers: {},
      body: null,
    };

    const result = await handler(event);

    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
  });
});
