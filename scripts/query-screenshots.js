#!/usr/bin/env node

/**
 * Script để query screenshots từ DynamoDB
 * Usage: node scripts/query-screenshots.js [status]
 *
 * Available statuses:
 *   - processing: Message sent to SQS, waiting for consumer
 *   - consumerProcessing: Consumer is actively processing the request
 *   - success: Screenshot captured and uploaded successfully
 *   - failed: Error occurred during processing
 */

require('dotenv').config();
const dynamodbService = require('../src/services/dynamodbService');

const status = process.argv[2] || 'success';

async function queryScreenshots() {
  try {
    console.log(`Querying screenshots with status: ${status}`);
    console.log('-------------------------------------------\n');

    const results = await dynamodbService.queryScreenshotsByStatus(status, 10);

    if (results.length === 0) {
      console.log('No screenshots found with this status.');
      return;
    }

    console.log(`Found ${results.length} screenshot(s):\n`);

    results.forEach((item, index) => {
      console.log(`${index + 1}. Screenshot ID: ${item.id}`);
      console.log(`   URL: ${item.url}`);
      console.log(`   Status: ${item.status}`);
      console.log(`   S3 URL: ${item.s3Url || 'N/A'}`);
      console.log(`   Created: ${item.createdAt}`);
      if (item.errorMessage) {
        console.log(`   Error: ${item.errorMessage}`);
      }
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error querying screenshots:', error.message);
    process.exit(1);
  }
}

queryScreenshots();
