const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../config/aws');
const config = require('../config');
const logger = require('../utils/logger');

class S3Service {
  /**
   * Upload file to S3
   * @param {Buffer} buffer - File buffer
   * @param {string} key - S3 object key
   * @param {string} contentType - Content type
   * @returns {Promise<Object>} Upload result with S3 URL
   */
  async uploadFile(buffer, key, contentType = 'image/png') {
    const startTime = Date.now();

    try {
      logger.info(
        {
          key,
          bucket: config.s3.bucketName,
          contentType,
          size: buffer.length,
        },
        'Uploading file to S3'
      );

      const command = new PutObjectCommand({
        Bucket: config.s3.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await s3Client.send(command);

      const s3Url = `https://${config.s3.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;
      const duration = Date.now() - startTime;

      logger.info(
        {
          key,
          bucket: config.s3.bucketName,
          url: s3Url,
          size: buffer.length,
          duration,
        },
        'File uploaded successfully to S3'
      );

      return {
        success: true,
        url: s3Url,
        key,
        bucket: config.s3.bucketName,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          err: error,
          key,
          bucket: config.s3.bucketName,
          duration,
        },
        'Failed to upload file to S3'
      );
      throw error;
    }
  }

  /**
   * Upload screenshot to S3
   * @param {Buffer} screenshot - Screenshot buffer
   * @param {string} filename - Filename
   * @param {string} format - Image format
   * @returns {Promise<Object>} Upload result
   */
  async uploadScreenshot(screenshot, filename, format = 'png') {
    const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const key = `${config.s3.screenshotPrefix}${filename}`;

    return this.uploadFile(screenshot, key, contentType);
  }

  /**
   * Generate S3 key for screenshot
   * @param {string} url - URL being screenshotted
   * @param {string} screenshotId - Unique screenshot ID
   * @param {string} format - Image format
   * @returns {string} S3 key
   */
  generateScreenshotKey(url, screenshotId, format = 'png') {
    const timestamp = new Date().toISOString().split('T')[0];
    const sanitizedUrl = url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);

    return `${config.s3.screenshotPrefix}${timestamp}/${screenshotId}_${sanitizedUrl}.${format}`;
  }
}

module.exports = new S3Service();
