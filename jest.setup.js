// Jest setup file
// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ENDPOINT = 'http://localhost:4566';
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.DYNAMODB_TABLE_NAME = 'test-table';
process.env.SQS_QUEUE_URL = 'http://localhost:4566/000000000000/test-queue';
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests
