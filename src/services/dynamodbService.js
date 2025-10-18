const { PutCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamoDBDocClient } = require('../config/aws');
const config = require('../config');
const logger = require('../utils/logger');

class DynamoDBService {
  /**
   * Save screenshot result to DynamoDB
   * @param {Object} data - Screenshot data
   * @param {Object} options - Additional options
   * @param {boolean} options.onlyIfNotExists - Only save if item doesn't exist (prevents race condition)
   * @returns {Promise<Object>} Save result
   */
  async saveScreenshotResult(data, options = {}) {
    const {
      screenshotId,
      url,
      s3Url,
      s3Key,
      status,
      width,
      height,
      format,
      errorMessage = null,
    } = data;

    const { onlyIfNotExists = false } = options;

    const timestamp = new Date().toISOString();

    const item = {
      id: screenshotId,
      url,
      s3Url: s3Url || null,
      s3Key: s3Key || null,
      status, // 'success', 'failed', 'processing'
      width,
      height,
      format,
      errorMessage,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      logger.info(
        {
          screenshotId,
          url,
          status,
          onlyIfNotExists,
          tableName: config.dynamodb.tableName,
        },
        'Saving screenshot result to DynamoDB'
      );

      const commandParams = {
        TableName: config.dynamodb.tableName,
        Item: item,
      };

      // Add conditional expression to prevent overwriting existing items
      if (onlyIfNotExists) {
        commandParams.ConditionExpression = 'attribute_not_exists(id)';
      }

      const command = new PutCommand(commandParams);

      await dynamoDBDocClient.send(command);

      logger.info(
        {
          screenshotId,
          status,
          tableName: config.dynamodb.tableName,
        },
        'Screenshot result saved successfully'
      );

      return {
        success: true,
        item,
      };
    } catch (error) {
      // ConditionalCheckFailedException is expected when using onlyIfNotExists
      // Don't log it as error, just re-throw to let caller handle it
      if (error.name === 'ConditionalCheckFailedException') {
        logger.debug(
          {
            screenshotId,
            tableName: config.dynamodb.tableName,
            condition: 'attribute_not_exists(id)',
          },
          'Conditional write failed - item already exists'
        );
        throw error;
      }

      // Log other errors as actual errors
      logger.error(
        {
          err: error,
          screenshotId,
          tableName: config.dynamodb.tableName,
        },
        'Failed to save to DynamoDB'
      );
      throw error;
    }
  }

  /**
   * Get screenshot by ID
   * @param {string} screenshotId - Screenshot ID
   * @returns {Promise<Object>} Screenshot item
   */
  async getScreenshot(screenshotId) {
    try {
      logger.debug({ screenshotId }, 'Getting screenshot from DynamoDB');

      const command = new GetCommand({
        TableName: config.dynamodb.tableName,
        Key: {
          id: screenshotId,
        },
      });

      const response = await dynamoDBDocClient.send(command);

      return response.Item || null;
    } catch (error) {
      logger.error({ err: error, screenshotId }, 'Error getting screenshot from DynamoDB');
      throw error;
    }
  }

  /**
   * Alias for getScreenshot for backward compatibility
   * @param {string} screenshotId - Screenshot ID
   * @returns {Promise<Object>} Screenshot item
   */
  async getScreenshotById(screenshotId) {
    return this.getScreenshot(screenshotId);
  }

  /**
   * Update screenshot status
   * @param {string} screenshotId - Screenshot ID
   * @param {string} status - New status
   * @param {Object} updates - Additional updates
   * @returns {Promise<Object>} Update result
   */
  async updateScreenshotStatus(screenshotId, status, updates = {}) {
    try {
      logger.info(`Updating screenshot status: ${screenshotId} -> ${status}`);

      const timestamp = new Date().toISOString();

      const command = new UpdateCommand({
        TableName: config.dynamodb.tableName,
        Key: {
          id: screenshotId,
        },
        UpdateExpression:
          'SET #status = :status, updatedAt = :updatedAt, #s3Url = :s3Url, #s3Key = :s3Key, #errorMessage = :errorMessage',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#s3Url': 's3Url',
          '#s3Key': 's3Key',
          '#errorMessage': 'errorMessage',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': timestamp,
          ':s3Url': updates.s3Url || null,
          ':s3Key': updates.s3Key || null,
          ':errorMessage': updates.errorMessage || null,
        },
        ReturnValues: 'ALL_NEW',
      });

      const response = await dynamoDBDocClient.send(command);

      logger.info(`Screenshot status updated successfully: ${screenshotId}`);

      return {
        success: true,
        item: response.Attributes,
      };
    } catch (error) {
      logger.error('Error updating screenshot status:', error);
      throw error;
    }
  }

  /**
   * Query screenshots by status
   * @param {string} status - Status to query
   * @param {number} limit - Limit results
   * @returns {Promise<Array>} Screenshot items
   */
  async queryScreenshotsByStatus(status, limit = 20) {
    try {
      logger.info(`Querying screenshots by status: ${status}`);

      const command = new QueryCommand({
        TableName: config.dynamodb.tableName,
        IndexName: 'status-createdAt-index', // You need to create this GSI
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
        Limit: limit,
        ScanIndexForward: false, // Sort descending by createdAt
      });

      const response = await dynamoDBDocClient.send(command);

      return response.Items || [];
    } catch (error) {
      logger.error('Error querying screenshots by status:', error);
      throw error;
    }
  }
}

module.exports = new DynamoDBService();
