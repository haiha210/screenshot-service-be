const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Create detailed mocks
const mockPage = {
  setViewport: jest.fn().mockResolvedValue(undefined),
  setUserAgent: jest.fn().mockResolvedValue(undefined),
  goto: jest.fn().mockResolvedValue(undefined),
  screenshot: jest.fn().mockResolvedValue(Buffer.from('mock screenshot data')),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  version: jest.fn().mockResolvedValue('Chrome/120.0.0.0'),
  close: jest.fn().mockResolvedValue(undefined),
};

// Mock puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue(mockBrowser),
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
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
  screenshot: {
    defaultWidth: 1920,
    defaultHeight: 1080,
    format: 'png',
    timeout: 30000,
  },
}));

const puppeteer = require('puppeteer');
const screenshotService = require('../screenshotService');

// Mock setTimeout to execute immediately
global.setTimeout = jest.fn((cb) => {
  cb();
  return 1;
});

describe('ScreenshotService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    screenshotService.browser = null;
  });

  afterEach(() => {
    screenshotService.browser = null;
  });

  describe('initBrowser', () => {
    it('should initialize browser successfully', async () => {
      const browser = await screenshotService.initBrowser();

      expect(puppeteer.launch).toHaveBeenCalled();
      expect(browser).toBe(mockBrowser);
      expect(mockBrowser.version).toHaveBeenCalled();
    });

    it('should use custom Chromium executable if exists', async () => {
      process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';

      await screenshotService.initBrowser();

      expect(puppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: '/usr/bin/chromium-browser',
        })
      );
    });

    it('should reuse existing browser if connected', async () => {
      await screenshotService.initBrowser();
      const callCount1 = puppeteer.launch.mock.calls.length;

      await screenshotService.initBrowser();
      const callCount2 = puppeteer.launch.mock.calls.length;

      expect(callCount2).toBe(callCount1);
    });

    it('should reinitialize browser if disconnected', async () => {
      await screenshotService.initBrowser();
      mockBrowser.version.mockRejectedValueOnce(new Error('Disconnected'));

      await screenshotService.initBrowser();

      expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    });
  });

  describe('captureScreenshot', () => {
    beforeEach(async () => {
      await screenshotService.initBrowser();
      jest.clearAllMocks();
    });

    it('should capture screenshot with default options', async () => {
      const result = await screenshotService.captureScreenshot({
        url: 'https://example.com',
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          waitUntil: 'networkidle0',
        })
      );
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        type: 'png',
        fullPage: false,
      });
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should capture screenshot with custom dimensions', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
        width: 1280,
        height: 720,
      });

      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
      });
    });

    it('should capture full page screenshot', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
        fullPage: true,
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        type: 'png',
        fullPage: true,
      });
    });

    it('should capture JPEG with quality', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
        format: 'jpeg',
        quality: 90,
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        type: 'jpeg',
        fullPage: false,
        quality: 90,
      });
    });

    it('should normalize URL without protocol', async () => {
      await screenshotService.captureScreenshot({
        url: 'example.com',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    it('should trim whitespace from URL', async () => {
      await screenshotService.captureScreenshot({
        url: '  example.com  ',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    it('should preserve http protocol', async () => {
      await screenshotService.captureScreenshot({
        url: 'http://example.com',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', expect.any(Object));
    });

    it('should preserve https protocol', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    it('should close page on navigation error', async () => {
      mockPage.goto.mockRejectedValueOnce(new Error('Navigation failed'));

      await expect(
        screenshotService.captureScreenshot({
          url: 'https://example.com',
        })
      ).rejects.toThrow('Navigation failed');

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should close page on screenshot error', async () => {
      mockPage.screenshot.mockRejectedValueOnce(new Error('Screenshot failed'));

      await expect(
        screenshotService.captureScreenshot({
          url: 'https://example.com',
        })
      ).rejects.toThrow('Screenshot failed');

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should close page on viewport error', async () => {
      mockPage.setViewport.mockRejectedValueOnce(new Error('Viewport error'));

      await expect(
        screenshotService.captureScreenshot({
          url: 'https://example.com',
        })
      ).rejects.toThrow('Viewport error');

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should set user agent', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
      });

      expect(mockPage.setUserAgent).toHaveBeenCalledWith(expect.stringContaining('Mozilla/5.0'));
    });
  });

  describe('closeBrowser', () => {
    it('should close browser if initialized', async () => {
      await screenshotService.initBrowser();
      jest.clearAllMocks();

      await screenshotService.closeBrowser();

      expect(mockBrowser.close).toHaveBeenCalled();
      expect(screenshotService.browser).toBeNull();
    });

    it('should do nothing if browser not initialized', async () => {
      screenshotService.browser = null;

      await screenshotService.closeBrowser();

      expect(mockBrowser.close).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await screenshotService.initBrowser();
      jest.clearAllMocks();
    });

    it('should handle long URLs', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(1000);

      await screenshotService.captureScreenshot({
        url: longUrl,
      });

      expect(mockPage.goto).toHaveBeenCalledWith(longUrl, expect.any(Object));
    });

    it('should handle URLs with query parameters', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com?param1=value1&param2=value2',
      });

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com?param1=value1&param2=value2',
        expect.any(Object)
      );
    });

    it('should handle minimum quality', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
        format: 'jpeg',
        quality: 1,
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        type: 'jpeg',
        fullPage: false,
        quality: 1,
      });
    });

    it('should handle maximum quality', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
        format: 'jpeg',
        quality: 100,
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        type: 'jpeg',
        fullPage: false,
        quality: 100,
      });
    });

    it('should handle small viewport', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
        width: 320,
        height: 240,
      });

      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 320,
        height: 240,
        deviceScaleFactor: 1,
      });
    });

    it('should handle large viewport', async () => {
      await screenshotService.captureScreenshot({
        url: 'https://example.com',
        width: 3840,
        height: 2160,
      });

      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 3840,
        height: 2160,
        deviceScaleFactor: 1,
      });
    });
  });
});
