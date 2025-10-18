#!/usr/bin/env node

/**
 * Script để gửi test message vào SQS queue
 * Usage: node scripts/send-test-message.js [url]
 */

// Load .env file but don't override existing environment variables
// This way docker-compose env vars take precedence
require('dotenv').config({ override: false });

const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// For local testing with LocalStack
// When running inside Docker container, AWS_ENDPOINT will be set by docker-compose
// When running on host machine, it will use localhost or can be set via USE_LOCALSTACK=true
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// If no AWS_ENDPOINT is set, try to detect LocalStack for local development
if (
  !process.env.AWS_ENDPOINT &&
  (process.env.USE_LOCALSTACK === 'true' || !process.env.SQS_QUEUE_URL)
) {
  // Running on host machine with LocalStack
  console.log('🔧 Auto-detecting LocalStack on localhost...');
  process.env.AWS_ENDPOINT = 'http://localhost:4566';
  process.env.SQS_QUEUE_URL =
    process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/screenshot-queue';
}

// Create SQS client
const sqsClient = new SQSClient({
  region: AWS_REGION,
  ...(process.env.AWS_ENDPOINT && {
    endpoint: process.env.AWS_ENDPOINT,
  }),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local_access_key_id',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local_secret_access_key',
  },
});

// Create DynamoDB client
const dynamoDBClient = new DynamoDBClient({
  region: AWS_REGION,
  ...(process.env.AWS_ENDPOINT && {
    endpoint: process.env.AWS_ENDPOINT,
  }),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local_access_key_id',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local_secret_access_key',
  },
});

const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

const url = process.argv[2] || 'https://example.com';

// Generate unique request ID
const requestId = uuidv4();

const message = {
  url,
  width: 1920,
  height: 1080,
  format: 'png',
  fullPage: false,
  requestId, // Add requestId to track this message
};

async function sendMessage() {
  try {
    console.log('==========================================');
    console.log('Sending Test Message to SQS');
    console.log('==========================================');
    console.log('URL:', url);
    console.log('Queue URL:', process.env.SQS_QUEUE_URL);
    console.log('Region:', AWS_REGION);
    console.log('');

    // Step 1: Create DynamoDB record with 'processing' status FIRST
    const timestamp = new Date().toISOString();
    const dynamoDBItem = {
      id: requestId,
      url: url,
      status: 'processing',
      width: message.width,
      height: message.height,
      format: message.format,
      s3Url: null,
      s3Key: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    console.log('Step 1: Creating DynamoDB record...');
    console.log('Table:', process.env.DYNAMODB_TABLE_NAME || 'screenshot-results');
    console.log('Request ID:', requestId);
    console.log('Status: processing');

    try {
      const putCommand = new PutCommand({
        TableName: process.env.DYNAMODB_TABLE_NAME || 'screenshot-results',
        Item: dynamoDBItem,
      });

      await dynamoDBDocClient.send(putCommand);
      console.log('✅ DynamoDB record created successfully');
    } catch (dbError) {
      console.error('❌ Failed to create DynamoDB record:', dbError.message);
      console.log('Aborting - message will not be sent to SQS');
      process.exit(1);
    }

    console.log('');

    // Step 2: Send message to SQS queue
    console.log('Step 2: Sending message to SQS...');
    console.log('Message:', JSON.stringify(message, null, 2));

    const command = new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
    });

    const response = await sqsClient.send(command);

    console.log('');
    console.log('==========================================');
    console.log('✅ Message sent successfully!');
    console.log('==========================================');
    console.log('Message ID:', response.MessageId);
    console.log('Request ID:', requestId, ' ← Use this to lookup screenshot');
    console.log('');

    // Save message info to file for later query
    try {
      const messageInfo = {
        messageId: response.MessageId,
        requestId: requestId,
        url: url,
        timestamp: new Date().toISOString(),
        queueUrl: process.env.SQS_QUEUE_URL,
      };

      const logsDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
      }

      const messagesFile = path.join(logsDir, 'sent-messages.json');
      let messages = [];

      if (fs.existsSync(messagesFile)) {
        try {
          const fileContent = fs.readFileSync(messagesFile, 'utf8');
          messages = JSON.parse(fileContent);
        } catch {
          console.warn('Could not read existing messages file, creating new one');
        }
      }

      messages.push(messageInfo);
      fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), {
        mode: 0o644,
      });

      console.log('Message details saved to:', messagesFile);
      console.log('');
    } catch (fileError) {
      console.warn('⚠️  Could not save message to file:', fileError.message);
    }

    console.log('==========================================');
    console.log('Next steps:');
    console.log('  1. Monitor logs: docker compose logs -f app');
    console.log(`  2. Check status: yarn get-screenshot ${requestId}`);
    console.log('  3. View results: yarn query-screenshots success');
    console.log('==========================================');
  } catch (error) {
    console.log(error);
    console.error('❌ Error sending message:', error);
    process.exit(1);
  }
}

sendMessage();
