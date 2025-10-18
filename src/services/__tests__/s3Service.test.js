const { describe, it, expect, beforeEach } = require('@jest/globals');
const s3Service = require('../s3Service');
const { s3Client } = require('../../config/aws');

// Mock AWS SDK
jest.mock('../../config/aws', () => ({
  s3Client: {
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
  s3: {
    bucketName: 'test-bucket',
    screenshotPrefix: 'screenshots/',
  },
  aws: {
    region: 'us-east-1',
  },
}));

describe('S3Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockBuffer = Buffer.from('test image data');
      const mockKey = 'screenshots/test.png';
      const mockContentType = 'image/png';

      s3Client.send.mockResolvedValueOnce({});

      const result = await s3Service.uploadFile(mockBuffer, mockKey, mockContentType);

      expect(result.success).toBe(true);
      expect(result.url).toBe(
        'https://test-bucket.s3.us-east-1.amazonaws.com/screenshots/test.png'
      );
      expect(result.key).toBe(mockKey);
      expect(result.bucket).toBe('test-bucket');
      expect(s3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should handle upload errors', async () => {
      const mockBuffer = Buffer.from('test image data');
      const mockKey = 'screenshots/test.png';
      const error = new Error('S3 upload failed');

      s3Client.send.mockRejectedValueOnce(error);

      await expect(s3Service.uploadFile(mockBuffer, mockKey)).rejects.toThrow('S3 upload failed');
    });

    it('should use default content type', async () => {
      const mockBuffer = Buffer.from('test image data');
      const mockKey = 'screenshots/test.png';

      s3Client.send.mockResolvedValueOnce({});

      await s3Service.uploadFile(mockBuffer, mockKey);

      const sendCall = s3Client.send.mock.calls[0][0];
      expect(sendCall.input.ContentType).toBe('image/png');
    });
  });

  describe('uploadScreenshot', () => {
    it('should upload PNG screenshot successfully', async () => {
      const mockBuffer = Buffer.from('screenshot data');
      const mockFilename = 'test-screenshot.png';

      s3Client.send.mockResolvedValueOnce({});

      const result = await s3Service.uploadScreenshot(mockBuffer, mockFilename, 'png');

      expect(result.success).toBe(true);
      expect(result.key).toBe('screenshots/test-screenshot.png');
      expect(s3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should upload JPEG screenshot successfully', async () => {
      const mockBuffer = Buffer.from('screenshot data');
      const mockFilename = 'test-screenshot.jpg';

      s3Client.send.mockResolvedValueOnce({});

      await s3Service.uploadScreenshot(mockBuffer, mockFilename, 'jpeg');

      const sendCall = s3Client.send.mock.calls[0][0];
      expect(sendCall.input.ContentType).toBe('image/jpeg');
    });
  });

  describe('generateScreenshotKey', () => {
    it('should generate valid S3 key with URL and ID', () => {
      const url = 'https://example.com/page';
      const screenshotId = 'test-123';
      const format = 'png';

      const key = s3Service.generateScreenshotKey(url, screenshotId, format);

      expect(key).toMatch(/^screenshots\/\d{4}-\d{2}-\d{2}\//);
      expect(key).toContain('test-123');
      expect(key).toContain('example_com_page');
      expect(key).toMatch(/\.png$/);
    });

    it('should sanitize URL properly', () => {
      const url = 'https://example.com/path?query=value&another=test';
      const screenshotId = 'test-456';

      const key = s3Service.generateScreenshotKey(url, screenshotId);

      expect(key).not.toContain('https://');
      expect(key).not.toContain('?');
      expect(key).not.toContain('&');
      expect(key).not.toContain('=');
      expect(key).toContain('_');
    });

    it('should truncate long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(100);
      const screenshotId = 'test-789';

      const key = s3Service.generateScreenshotKey(longUrl, screenshotId);

      const urlPart = key.split('/').pop().split('_')[1]; // Get URL part
      expect(urlPart.length).toBeLessThanOrEqual(50);
    });

    it('should handle different formats', () => {
      const url = 'https://example.com';
      const screenshotId = 'test-101';

      const pngKey = s3Service.generateScreenshotKey(url, screenshotId, 'png');
      const jpegKey = s3Service.generateScreenshotKey(url, screenshotId, 'jpeg');

      expect(pngKey).toMatch(/\.png$/);
      expect(jpegKey).toMatch(/\.jpeg$/);
    });

    it('should include current date in key', () => {
      const url = 'https://example.com';
      const screenshotId = 'test-202';
      const today = new Date().toISOString().split('T')[0];

      const key = s3Service.generateScreenshotKey(url, screenshotId);

      expect(key).toContain(today);
    });
  });
});
