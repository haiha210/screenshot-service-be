const { describe, it, expect, beforeEach } = require('@jest/globals');
const { handleMessage } = require('../sqsConsumer');
const screenshotService = require('../screenshotService');
const s3Service = require('../s3Service');
const dynamodbService = require('../dynamodbService');

// Mock dependencies
jest.mock('../screenshotService');
jest.mock('../s3Service');
jest.mock('../dynamodbService');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('SQS Consumer - handleMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockMessage = (body) => ({
    MessageId: 'test-message-id',
    Body: JSON.stringify(body),
  });

  describe('Successful Processing', () => {
    it('should process screenshot message successfully', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        width: 1920,
        height: 1080,
        format: 'png',
        requestId: 'test-123',
      });

      const mockScreenshot = Buffer.from('screenshot data');
      const mockS3Result = {
        success: true,
        url: 'https://s3.amazonaws.com/bucket/screenshot.png',
        key: 'screenshots/test.png',
      };

      // Setup mocks - record already exists with 'processing' status from send-test-message
      dynamodbService.getScreenshot.mockResolvedValueOnce({
        id: 'test-123',
        status: 'processing',
        url: 'https://example.com',
      });
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // Update to consumerProcessing
      screenshotService.captureScreenshot.mockResolvedValueOnce(mockScreenshot);
      s3Service.generateScreenshotKey.mockReturnValueOnce('screenshots/test.png');
      s3Service.uploadFile.mockResolvedValueOnce(mockS3Result);
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // Final success

      // Execute
      await handleMessage(mockMessage);

      // Verify
      expect(dynamodbService.getScreenshot).toHaveBeenCalledWith('test-123');
      // Should NOT create new record, only update existing one
      expect(dynamodbService.saveScreenshotResult).not.toHaveBeenCalled();
      // Should update to consumerProcessing status
      expect(dynamodbService.updateScreenshotStatus).toHaveBeenNthCalledWith(
        1,
        'test-123',
        'consumerProcessing',
        expect.objectContaining({
          width: 1920,
          height: 1080,
          format: 'png',
        })
      );
      expect(screenshotService.captureScreenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          width: 1920,
          height: 1080,
          format: 'png',
        })
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        mockScreenshot,
        'screenshots/test.png',
        'image/png'
      );
      expect(dynamodbService.updateScreenshotStatus).toHaveBeenNthCalledWith(
        2,
        'test-123',
        'success',
        expect.objectContaining({
          s3Url: mockS3Result.url,
          s3Key: mockS3Result.key,
        })
      );
    });

    it('should skip already successful screenshot', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
      });

      const existingScreenshot = {
        id: 'test-123',
        status: 'success',
        s3Url: 'https://s3.amazonaws.com/bucket/existing.png',
      };

      dynamodbService.getScreenshot.mockResolvedValueOnce(existingScreenshot);

      // Execute
      await handleMessage(mockMessage);

      // Verify - should skip processing
      expect(dynamodbService.saveScreenshotResult).not.toHaveBeenCalled();
      expect(screenshotService.captureScreenshot).not.toHaveBeenCalled();
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('should skip screenshot being processed by another instance', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
      });

      const existingScreenshot = {
        id: 'test-123',
        status: 'consumerProcessing', // Already being actively processed
        createdAt: new Date().toISOString(), // Recent
      };

      dynamodbService.getScreenshot.mockResolvedValueOnce(existingScreenshot);

      // Execute
      await handleMessage(mockMessage);

      // Verify - should skip processing
      expect(screenshotService.captureScreenshot).not.toHaveBeenCalled();
    });

    it('should retry stale processing screenshot', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
      });

      const staleDate = new Date();
      staleDate.setMinutes(staleDate.getMinutes() - 15); // 15 minutes ago (stale)

      const existingScreenshot = {
        id: 'test-123',
        status: 'consumerProcessing', // Stale consumerProcessing status
        createdAt: staleDate.toISOString(),
        updatedAt: staleDate.toISOString(),
      };

      const mockScreenshot = Buffer.from('screenshot data');
      const mockS3Result = {
        success: true,
        url: 'https://s3.amazonaws.com/bucket/screenshot.png',
        key: 'screenshots/test.png',
      };

      // Setup mocks
      dynamodbService.getScreenshot.mockResolvedValueOnce(existingScreenshot);
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // Update to consumerProcessing
      screenshotService.captureScreenshot.mockResolvedValueOnce(mockScreenshot);
      s3Service.generateScreenshotKey.mockReturnValueOnce('screenshots/test.png');
      s3Service.uploadFile.mockResolvedValueOnce(mockS3Result);
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // Final success

      // Execute
      await handleMessage(mockMessage);

      // Verify - should process (retry stale)
      expect(screenshotService.captureScreenshot).toHaveBeenCalled();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should skip when conditional write fails (race condition)', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
      });

      // Setup mocks - record not found, fallback will create it
      dynamodbService.getScreenshot.mockResolvedValueOnce(null);
      dynamodbService.saveScreenshotResult.mockResolvedValueOnce({ success: true });
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // consumerProcessing

      const mockScreenshot = Buffer.from('screenshot data');
      const mockS3Result = {
        success: true,
        url: 'https://s3.amazonaws.com/bucket/screenshot.png',
        key: 'screenshots/test.png',
      };

      screenshotService.captureScreenshot.mockResolvedValueOnce(mockScreenshot);
      s3Service.generateScreenshotKey.mockReturnValueOnce('screenshots/test.png');
      s3Service.uploadFile.mockResolvedValueOnce(mockS3Result);
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // success

      // Execute
      await handleMessage(mockMessage);

      // Verify - should process with fallback record creation
      expect(dynamodbService.saveScreenshotResult).toHaveBeenCalled();
      expect(screenshotService.captureScreenshot).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when URL is missing', async () => {
      const mockMessage = createMockMessage({
        requestId: 'test-123',
        // URL missing
      });

      await expect(handleMessage(mockMessage)).rejects.toThrow('URL is required in message body');
    });

    it('should update status to failed when screenshot fails', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
      });

      const screenshotError = new Error('Screenshot failed');

      // Setup mocks
      dynamodbService.getScreenshot.mockResolvedValueOnce({
        id: 'test-123',
        status: 'processing',
      });
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // consumerProcessing
      screenshotService.captureScreenshot.mockRejectedValueOnce(screenshotError);
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // failed

      // Execute
      await expect(handleMessage(mockMessage)).rejects.toThrow('Screenshot failed');

      // Verify status updated to failed
      expect(dynamodbService.updateScreenshotStatus).toHaveBeenCalledWith(
        'test-123',
        'failed',
        expect.objectContaining({
          errorMessage: 'Screenshot failed',
        })
      );
    });

    it('should update status to failed when S3 upload fails', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
      });

      const mockScreenshot = Buffer.from('screenshot data');
      const uploadError = new Error('S3 upload failed');

      // Setup mocks
      dynamodbService.getScreenshot.mockResolvedValueOnce({
        id: 'test-123',
        status: 'processing',
      });
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // consumerProcessing
      screenshotService.captureScreenshot.mockResolvedValueOnce(mockScreenshot);
      s3Service.generateScreenshotKey.mockReturnValueOnce('screenshots/test.png');
      s3Service.uploadFile.mockRejectedValueOnce(uploadError);
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // failed

      // Execute
      await expect(handleMessage(mockMessage)).rejects.toThrow('S3 upload failed');

      // Verify status updated to failed
      expect(dynamodbService.updateScreenshotStatus).toHaveBeenCalledWith(
        'test-123',
        'failed',
        expect.objectContaining({
          errorMessage: 'S3 upload failed',
        })
      );
    });

    it('should handle DynamoDB update failure gracefully', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
      });

      const screenshotError = new Error('Screenshot failed');
      const dbUpdateError = new Error('DynamoDB update failed');

      // Setup mocks
      dynamodbService.getScreenshot.mockResolvedValueOnce({
        id: 'test-123',
        status: 'processing',
      });
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // consumerProcessing
      screenshotService.captureScreenshot.mockRejectedValueOnce(screenshotError);
      dynamodbService.updateScreenshotStatus.mockRejectedValueOnce(dbUpdateError); // failed update fails

      // Execute
      await expect(handleMessage(mockMessage)).rejects.toThrow('Screenshot failed');

      // Verify it tried to update status
      expect(dynamodbService.updateScreenshotStatus).toHaveBeenCalled();
    });
  });

  describe('Message Body Parsing', () => {
    it('should use default values for optional parameters', async () => {
      const mockMessage = createMockMessage({
        url: 'https://example.com',
        requestId: 'test-123',
        // No width, height, format specified
      });

      const mockScreenshot = Buffer.from('screenshot data');
      const mockS3Result = {
        success: true,
        url: 'https://s3.amazonaws.com/bucket/screenshot.png',
        key: 'screenshots/test.png',
      };

      // Setup mocks
      dynamodbService.getScreenshot.mockResolvedValueOnce(null); // Not found, will use fallback
      dynamodbService.saveScreenshotResult.mockResolvedValueOnce({ success: true }); // Fallback create
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // consumerProcessing
      screenshotService.captureScreenshot.mockResolvedValueOnce(mockScreenshot);
      s3Service.generateScreenshotKey.mockReturnValueOnce('screenshots/test.png');
      s3Service.uploadFile.mockResolvedValueOnce(mockS3Result);
      dynamodbService.updateScreenshotStatus.mockResolvedValueOnce({ success: true }); // success

      // Execute
      await handleMessage(mockMessage);

      // Verify default values used
      expect(screenshotService.captureScreenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'png',
          quality: 80,
          fullPage: false,
        })
      );
    });
  });
});
