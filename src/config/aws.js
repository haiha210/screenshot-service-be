const { S3Client } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");

// AWS Region configuration
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// AWS Endpoint for LocalStack support
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || undefined;

// Base AWS client config
const getBaseConfig = () => ({
  region: AWS_REGION,
  ...(AWS_ENDPOINT && {
    endpoint: AWS_ENDPOINT,
    forcePathStyle: true, // Needed for S3 with LocalStack
  }),
  ...(process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY && {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    }),
});

// S3 Client
const s3Client = new S3Client(getBaseConfig());

// DynamoDB Client
const dynamoDBClient = new DynamoDBClient(getBaseConfig());

// DynamoDB Document Client for easier operations
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: true,
  },
});

// SQS Client
const sqsClient = new SQSClient(getBaseConfig());

module.exports = {
  s3Client,
  dynamoDBClient,
  dynamoDBDocClient,
  sqsClient,
  AWS_REGION,
};
