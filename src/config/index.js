require('dotenv').config();

const config = {
  // AWS Configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  // SQS Configuration
  sqs: {
    queueUrl: process.env.SQS_QUEUE_URL,
    batchSize: parseInt(process.env.SQS_BATCH_SIZE || '1', 10),
    visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '300', 10),
    waitTimeSeconds: parseInt(process.env.SQS_WAIT_TIME_SECONDS || '20', 10),
  },

  // S3 Configuration
  s3: {
    bucketName: process.env.S3_BUCKET_NAME,
    screenshotPrefix: process.env.S3_SCREENSHOT_PREFIX || 'screenshots/',
  },

  // DynamoDB Configuration
  dynamodb: {
    tableName: process.env.DYNAMODB_TABLE_NAME,
  },

  // Screenshot Configuration
  screenshot: {
    defaultWidth: parseInt(process.env.SCREENSHOT_WIDTH || '1920', 10),
    defaultHeight: parseInt(process.env.SCREENSHOT_HEIGHT || '1080', 10),
    timeout: parseInt(process.env.SCREENSHOT_TIMEOUT || '30000', 10),
    format: process.env.SCREENSHOT_FORMAT || 'png',
  },

  // Application Configuration
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required configuration
const requiredConfigs = ['SQS_QUEUE_URL', 'S3_BUCKET_NAME', 'DYNAMODB_TABLE_NAME'];

const missingConfigs = requiredConfigs.filter((key) => !process.env[key]);

if (missingConfigs.length > 0) {
  console.error('Missing required environment variables:', missingConfigs.join(', '));
  if (config.app.nodeEnv === 'production') {
    process.exit(1);
  }
}

module.exports = config;
