#!/usr/bin/env node

/**
 * Script to get screenshot by requestId from DynamoDB
 * Usage: node scripts/get-screenshot.js <requestId>
 */

require('dotenv').config();
const dynamodbService = require('../src/services/dynamodbService');

const requestId = process.argv[2];

async function getScreenshot() {
  try {
    if (!requestId) {
      console.error('❌ Error: requestId is required');
      console.log('Usage: node scripts/get-screenshot.js <requestId>');
      console.log('Example: node scripts/get-screenshot.js 4f6f6899-7da4-4c33-87a1-4a3b0a484b9c');
      process.exit(1);
    }

    console.log(`🔍 Looking up screenshot with requestId: ${requestId}`);
    console.log('-------------------------------------------\n');

    const screenshot = await dynamodbService.getScreenshot(requestId);

    if (!screenshot) {
      console.log('❌ Screenshot not found with this requestId.');
      console.log('\nTip: Make sure you are using the correct requestId (UUID format).');
      process.exit(1);
    }

    console.log('✅ Screenshot found!\n');
    console.log('Screenshot Details:');
    console.log('==========================================');
    console.log(`ID:              ${screenshot.id}`);
    console.log(`URL:             ${screenshot.url}`);
    console.log(`Status:          ${screenshot.status}`);
    console.log(`Format:          ${screenshot.format}`);
    console.log(`Width:           ${screenshot.width}px`);
    console.log(`Height:          ${screenshot.height}px`);
    console.log(`Created At:      ${screenshot.createdAt}`);
    console.log(`Updated At:      ${screenshot.updatedAt || 'N/A'}`);
    console.log('');

    if (screenshot.s3Url) {
      console.log('S3 Information:');
      console.log('------------------------------------------');
      console.log(`S3 URL:          ${screenshot.s3Url}`);
      console.log(`S3 Key:          ${screenshot.s3Key || 'N/A'}`);
      console.log('');
    }

    if (screenshot.errorMessage) {
      console.log('Error Information:');
      console.log('------------------------------------------');
      console.log(`Error:           ${screenshot.errorMessage}`);
      console.log('');
    }

    // Additional metadata
    if (screenshot.fullPage !== undefined) {
      console.log('Screenshot Options:');
      console.log('------------------------------------------');
      console.log(`Full Page:       ${screenshot.fullPage}`);
      console.log(`Quality:         ${screenshot.quality || 'N/A'}`);
      console.log('');
    }

    // Status indicator
    console.log('Status Summary:');
    console.log('==========================================');
    if (screenshot.status === 'success') {
      console.log('✅ Screenshot captured successfully');
      if (screenshot.s3Url) {
        console.log(`📸 Download: ${screenshot.s3Url}`);
      }
    } else if (screenshot.status === 'processing') {
      console.log('⏳ Screenshot is being processed...');
      const processingStartTime = new Date(screenshot.updatedAt || screenshot.createdAt);
      const now = new Date();
      const durationMs = now - processingStartTime;
      const durationMin = Math.floor(durationMs / 60000);
      console.log(`⏱️  Processing duration: ${durationMin} minutes`);
    } else if (screenshot.status === 'failed') {
      console.log('❌ Screenshot processing failed');
      if (screenshot.errorMessage) {
        console.log(`💬 Reason: ${screenshot.errorMessage}`);
      }
    }
    console.log('');
  } catch (error) {
    console.error('❌ Error getting screenshot:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

getScreenshot();
