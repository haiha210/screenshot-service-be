const { describe, it, expect, beforeEach } = require('@jest/globals');
const dynamodbService = require('../dynamodbService');
const { dynamoDBDocClient } = require('../../config/aws');

// Mock AWS SDK
jest.mock('../../config/aws', () => ({
  dynamoDBDocClient: {
    send: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock config
jest.mock('../../config', () => ({
  dynamodb: {
    tableName: 'test-screenshots',
  },
}));

describe('DynamoDBService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveScreenshotResult', () => {
    it('should save screenshot result successfully', async () => {
      const mockData = {
        screenshotId: 'test-123',
        url: 'https://example.com',
        s3Url: 'https://s3.amazonaws.com/bucket/test.png',
        s3Key: 'screenshots/test.png',
        status: 'success',
        width: 1920,
        height: 1080,
        format: 'png',
      };

      dynamoDBDocClient.send.mockResolvedValueOnce({});

      const result = await dynamodbService.saveScreenshotResult(mockData);

      expect(result.success).toBe(true);
      expect(result.item.id).toBe('test-123');
      expect(result.item.url).toBe('https://example.com');
      expect(result.item.status).toBe('success');
      expect(dynamoDBDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('should save with onlyIfNotExists option', async () => {
      const mockData = {
        screenshotId: 'test-123',
        url: 'https://example.com',
        status: 'processing',
        width: 1920,
        height: 1080,
        format: 'png',
      };

      dynamoDBDocClient.send.mockResolvedValueOnce({});

      await dynamodbService.saveScreenshotResult(mockData, { onlyIfNotExists: true });

      const sendCall = dynamoDBDocClient.send.mock.calls[0][0];
      expect(sendCall.input.ConditionExpression).toBe('attribute_not_exists(id)');
    });

    it('should throw ConditionalCheckFailedException when item already exists', async () => {
      const mockData = {
        screenshotId: 'test-123',
        url: 'https://example.com',
        status: 'processing',
        width: 1920,
        height: 1080,
        format: 'png',
      };

      const conditionalError = new Error('Conditional check failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      dynamoDBDocClient.send.mockRejectedValueOnce(conditionalError);

      await expect(
        dynamodbService.saveScreenshotResult(mockData, { onlyIfNotExists: true })
      ).rejects.toThrow('Conditional check failed');
    });

    it('should handle other errors', async () => {
      const mockData = {
        screenshotId: 'test-123',
        url: 'https://example.com',
        status: 'processing',
        width: 1920,
        height: 1080,
        format: 'png',
      };

      const error = new Error('DynamoDB error');
      dynamoDBDocClient.send.mockRejectedValueOnce(error);

      await expect(dynamodbService.saveScreenshotResult(mockData)).rejects.toThrow(
        'DynamoDB error'
      );
    });
  });

  describe('getScreenshot', () => {
    it('should get screenshot by ID successfully', async () => {
      const mockItem = {
        id: 'test-123',
        url: 'https://example.com',
        status: 'success',
        s3Url: 'https://s3.amazonaws.com/bucket/test.png',
      };

      dynamoDBDocClient.send.mockResolvedValueOnce({ Item: mockItem });

      const result = await dynamodbService.getScreenshot('test-123');

      expect(result).toEqual(mockItem);
      expect(dynamoDBDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('should return null when screenshot not found', async () => {
      dynamoDBDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await dynamodbService.getScreenshot('non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      const error = new Error('DynamoDB error');
      dynamoDBDocClient.send.mockRejectedValueOnce(error);

      await expect(dynamodbService.getScreenshot('test-123')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('updateScreenshotStatus', () => {
    it('should update screenshot status successfully', async () => {
      const mockResponse = {
        Attributes: {
          id: 'test-123',
          status: 'success',
          s3Url: 'https://s3.amazonaws.com/bucket/test.png',
        },
      };

      dynamoDBDocClient.send.mockResolvedValueOnce(mockResponse);

      const result = await dynamodbService.updateScreenshotStatus('test-123', 'success', {
        s3Url: 'https://s3.amazonaws.com/bucket/test.png',
        s3Key: 'screenshots/test.png',
      });

      expect(result.success).toBe(true);
      expect(result.item.status).toBe('success');
      expect(dynamoDBDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      dynamoDBDocClient.send.mockRejectedValueOnce(error);

      await expect(
        dynamodbService.updateScreenshotStatus('test-123', 'failed', {
          errorMessage: 'Test error',
        })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('queryScreenshotsByStatus', () => {
    it('should query screenshots by status successfully', async () => {
      const mockItems = [
        { id: 'test-1', status: 'success', url: 'https://example.com' },
        { id: 'test-2', status: 'success', url: 'https://google.com' },
      ];

      dynamoDBDocClient.send.mockResolvedValueOnce({ Items: mockItems });

      const result = await dynamodbService.queryScreenshotsByStatus('success', 10);

      expect(result).toEqual(mockItems);
      expect(result.length).toBe(2);
      expect(dynamoDBDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no items found', async () => {
      dynamoDBDocClient.send.mockResolvedValueOnce({ Items: undefined });

      const result = await dynamodbService.queryScreenshotsByStatus('failed');

      expect(result).toEqual([]);
    });

    it('should handle query errors', async () => {
      const error = new Error('Query failed');
      dynamoDBDocClient.send.mockRejectedValueOnce(error);

      await expect(dynamodbService.queryScreenshotsByStatus('success')).rejects.toThrow(
        'Query failed'
      );
    });
  });
});
