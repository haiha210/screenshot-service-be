#!/usr/bin/env node

/**
 * Script để gửi test message vào SQS queue
 * Usage: node scripts/send-test-message.js [url]
 */

require("dotenv").config();
const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { SQSClient } = require("@aws-sdk/client-sqs");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// For local testing with LocalStack, override the endpoint
const isLocalStack =
  process.env.AWS_ENDPOINT?.includes("localstack") ||
  process.env.USE_LOCALSTACK === "true";
const AWS_ENDPOINT = isLocalStack
  ? "http://localhost:4566"
  : process.env.AWS_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const QUEUE_URL =
  process.env.SQS_QUEUE_URL ||
  "http://localhost:4566/000000000000/screenshot-queue";

// Create SQS client for local testing
const sqsClient = new SQSClient({
  region: AWS_REGION,
  ...(AWS_ENDPOINT && {
    endpoint: AWS_ENDPOINT,
  }),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  },
});

const url = process.argv[2] || "https://example.com";

// Generate unique request ID
const requestId = uuidv4();

const message = {
  url,
  width: 1920,
  height: 1080,
  format: "png",
  fullPage: false,
  requestId, // Add requestId to track this message
};

async function sendMessage() {
  try {
    console.log("Sending message to SQS queue...");
    console.log("Endpoint:", AWS_ENDPOINT || "AWS Default");
    console.log("Queue URL:", QUEUE_URL);
    console.log("Message:", JSON.stringify(message, null, 2));

    const command = new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(message),
    });

    const response = await sqsClient.send(command);

    console.log("\n✅ Message sent successfully!");
    console.log("Message ID:", response.MessageId);
    console.log("Request ID:", requestId);

    // Save message info to file for later query
    try {
      const messageInfo = {
        messageId: response.MessageId,
        requestId: requestId,
        url: url,
        timestamp: new Date().toISOString(),
        queueUrl: QUEUE_URL,
      };

      const logsDir = path.join(__dirname, "..", "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
      }

      const messagesFile = path.join(logsDir, "sent-messages.json");
      let messages = [];

      if (fs.existsSync(messagesFile)) {
        try {
          const fileContent = fs.readFileSync(messagesFile, "utf8");
          messages = JSON.parse(fileContent);
        } catch (error) {
          console.warn(
            "Could not read existing messages file, creating new one"
          );
        }
      }

      messages.push(messageInfo);
      fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), {
        mode: 0o644,
      });

      console.log("\n📝 Message info saved to:", messagesFile);
    } catch (fileError) {
      console.warn("\n⚠️  Could not save message to file:", fileError.message);
      console.log("Message sent successfully but tracking file not saved");
    }

    console.log("\nTo query this screenshot later:");
    console.log(`  yarn query-screenshots`);
    console.log(`  or check DynamoDB for requestId: ${requestId}`);
    console.log("\nScreenshot will be processed shortly...");
  } catch (error) {
    console.error("❌ Error sending message:", error.message);
    console.error("\nTroubleshooting:");
    console.error("- Make sure LocalStack is running: docker-compose ps");
    console.error(
      "- Check queue exists: source venv/bin/activate && awslocal sqs list-queues"
    );
    console.error("- Verify endpoint:", AWS_ENDPOINT || "Using AWS default");
    process.exit(1);
  }
}

sendMessage();
