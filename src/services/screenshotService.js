const puppeteer = require('puppeteer');
const config = require('../config');
const logger = require('../utils/logger');

class ScreenshotService {
  constructor() {
    this.browser = null;
  }

  /**
   * Initialize Puppeteer browser
   */
  async initBrowser(retries = 3) {
    if (this.browser) {
      try {
        // Check if browser is still connected
        await this.browser.version();
        return this.browser;
      } catch (error) {
        logger.warn('Browser disconnected, reinitializing...');
        this.browser = null;
      }
    }

    logger.info('Initializing Puppeteer browser...');

    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1920,1080',
      ],
      // Increase timeout for slow environments
      timeout: 30000,
    };

    // Find Chromium executable in Alpine
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
    const fs = require('fs');
    if (fs.existsSync(executablePath)) {
      launchOptions.executablePath = executablePath;
      logger.info({ executablePath }, 'Using custom Chromium executable');
    }

    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        this.browser = await puppeteer.launch(launchOptions);
        logger.info('Puppeteer browser initialized successfully');

        // Test the browser
        const version = await this.browser.version();
        logger.info({ version }, 'Browser version');

        return this.browser;
      } catch (error) {
        lastError = error;
        logger.warn({ attempt: i + 1, retries, err: error }, 'Failed to launch browser, retrying...');
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }

    throw lastError;
  }

  /**
   * Capture screenshot of a URL
   * @param {Object} options - Screenshot options
   * @param {string} options.url - URL to screenshot
   * @param {number} options.width - Viewport width
   * @param {number} options.height - Viewport height
   * @param {string} options.format - Image format (png/jpeg)
   * @param {number} options.quality - Image quality (for jpeg)
   * @param {boolean} options.fullPage - Capture full page
   * @returns {Promise<Buffer>} Screenshot buffer
   */
  async captureScreenshot(options) {
    const {
      url,
      width = config.screenshot.defaultWidth,
      height = config.screenshot.defaultHeight,
      format = config.screenshot.format,
      quality = 80,
      fullPage = false,
    } = options;

    const startTime = Date.now();
    logger.info({ url, width, height, format, fullPage }, 'Capturing screenshot');

    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // Set viewport
      await page.setViewport({
        width,
        height,
        deviceScaleFactor: 1,
      });

      // Set user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to URL with timeout
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: config.screenshot.timeout,
      });

      // Wait a bit for dynamic content using standard setTimeout
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Take screenshot
      const screenshotOptions = {
        type: format,
        fullPage,
      };

      if (format === 'jpeg') {
        screenshotOptions.quality = quality;
      }

      const screenshot = await page.screenshot(screenshotOptions);

      const duration = Date.now() - startTime;
      logger.info({
        url,
        size: screenshot.length,
        duration,
        format
      }, 'Screenshot captured successfully');

      return screenshot;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        err: error,
        url,
        duration,
        format
      }, 'Failed to capture screenshot');
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Close browser
   */
  async closeBrowser() {
    if (this.browser) {
      logger.info('Closing Puppeteer browser...');
      await this.browser.close();
      this.browser = null;
      logger.info('Puppeteer browser closed');
    }
  }
}

module.exports = new ScreenshotService();
