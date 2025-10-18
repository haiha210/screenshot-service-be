# Testing Guide

## Overview

This project uses **Jest** as the testing framework for unit tests. Tests are located in `__tests__` directories alongside the code they test.

---

## Quick Start

### Run All Tests

```bash
# Run all tests
npm test

# Or with yarn
yarn test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Specific Test File

```bash
npx jest src/services/__tests__/dynamodbService.test.js
```

### Run Tests with Verbose Output

```bash
npm run test:verbose
```

---

## Test Structure

### Directory Structure

```
src/
├── services/
│   ├── __tests__/
│   │   ├── dynamodbService.test.js
│   │   ├── s3Service.test.js
│   │   └── sqsConsumer.test.js
│   ├── dynamodbService.js
│   ├── s3Service.js
│   └── sqsConsumer.js
└── utils/
    └── logger.js
```

### Test File Naming

- **Unit tests**: `*.test.js`
- **Integration tests**: `*.integration.test.js` (if needed)
- **Test location**: `__tests__/` directory next to source files

---

## Test Coverage

### Current Coverage

```
File                   | % Stmts | % Branch | % Funcs | % Lines
-----------------------|---------|----------|---------|--------
dynamodbService.js     |   97.87 |    95.65 |      80 |   97.87
s3Service.js           |     100 |       80 |     100 |     100
sqsConsumer.js         |   76.19 |    96.29 |    12.5 |   76.19
```

### Coverage Thresholds

Configured in `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 65,
    functions: 40,
    lines: 60,
    statements: 60,
  },
}
```

### View Coverage Report

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report in browser
open coverage/lcov-report/index.html
```

---

## Writing Tests

### Basic Test Structure

```javascript
const { describe, it, expect, beforeEach } = require('@jest/globals');
const myService = require('../myService');

// Mock dependencies
jest.mock('../dependency');

describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = myService.methodName(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Mocking AWS SDK

```javascript
jest.mock('../../config/aws', () => ({
  s3Client: {
    send: jest.fn(),
  },
  dynamoDBDocClient: {
    send: jest.fn(),
  },
}));

// In test
s3Client.send.mockResolvedValueOnce({ /* response */ });
```

### Mocking Services

```javascript
jest.mock('../screenshotService');

// In test
screenshotService.captureScreenshot.mockResolvedValueOnce(Buffer.from('data'));
```

### Testing Async Functions

```javascript
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Testing Error Handling

```javascript
it('should throw error on failure', async () => {
  service.method.mockRejectedValueOnce(new Error('Failed'));

  await expect(handleMessage(message)).rejects.toThrow('Failed');
});
```

---

## Test Examples

### 1. DynamoDB Service Tests

**File**: `src/services/__tests__/dynamodbService.test.js`

```javascript
describe('saveScreenshotResult', () => {
  it('should save screenshot result successfully', async () => {
    const mockData = {
      screenshotId: 'test-123',
      url: 'https://example.com',
      status: 'success',
      width: 1920,
      height: 1080,
      format: 'png',
    };

    dynamoDBDocClient.send.mockResolvedValueOnce({});

    const result = await dynamodbService.saveScreenshotResult(mockData);

    expect(result.success).toBe(true);
    expect(result.item.id).toBe('test-123');
    expect(dynamoDBDocClient.send).toHaveBeenCalledTimes(1);
  });
});
```

### 2. S3 Service Tests

**File**: `src/services/__tests__/s3Service.test.js`

```javascript
describe('uploadFile', () => {
  it('should upload file successfully', async () => {
    const mockBuffer = Buffer.from('test image data');
    const mockKey = 'screenshots/test.png';

    s3Client.send.mockResolvedValueOnce({});

    const result = await s3Service.uploadFile(mockBuffer, mockKey);

    expect(result.success).toBe(true);
    expect(result.url).toContain('test-bucket.s3');
  });
});
```

### 3. SQS Consumer Tests

**File**: `src/services/__tests__/sqsConsumer.test.js`

```javascript
describe('handleMessage', () => {
  it('should process screenshot message successfully', async () => {
    const mockMessage = {
      MessageId: 'test-message-id',
      Body: JSON.stringify({
        url: 'https://example.com',
        requestId: 'test-123',
      }),
    };

    dynamodbService.getScreenshot.mockResolvedValueOnce(null);
    screenshotService.captureScreenshot.mockResolvedValueOnce(Buffer.from('data'));
    s3Service.uploadFile.mockResolvedValueOnce({ url: 's3://...' });

    await handleMessage(mockMessage);

    expect(screenshotService.captureScreenshot).toHaveBeenCalled();
  });
});
```

---

## Mock Configuration

### Jest Setup

**File**: `jest.setup.js`

Sets environment variables for testing:

```javascript
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ENDPOINT = 'http://localhost:4566';
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests
```

### Global Mocks

Always mock:
- AWS SDK clients (S3, DynamoDB, SQS)
- Logger (suppress output)
- External services
- Configuration

---

## Best Practices

### 1. **Arrange-Act-Assert Pattern**

```javascript
it('should do something', async () => {
  // Arrange - setup test data and mocks
  const input = 'test';
  mockFunction.mockResolvedValueOnce('result');

  // Act - execute the code under test
  const result = await functionUnderTest(input);

  // Assert - verify expectations
  expect(result).toBe('expected');
});
```

### 2. **Clear Mocks Between Tests**

```javascript
beforeEach(() => {
  jest.clearAllMocks();
});
```

### 3. **Test One Thing Per Test**

```javascript
// ✅ Good - tests one specific behavior
it('should skip already successful screenshot', async () => {
  // ...test one specific case
});

// ❌ Bad - tests multiple things
it('should handle all edge cases', async () => {
  // ...tests too many scenarios
});
```

### 4. **Use Descriptive Test Names**

```javascript
// ✅ Good
it('should throw error when URL is missing', async () => {});

// ❌ Bad
it('should work', async () => {});
```

### 5. **Mock Only What's Needed**

```javascript
// ✅ Good - mock only dependencies
jest.mock('../externalService');

// ❌ Bad - don't mock the service being tested
jest.mock('../serviceUnderTest');
```

### 6. **Test Error Paths**

```javascript
describe('Error Handling', () => {
  it('should handle database errors', async () => {
    db.save.mockRejectedValueOnce(new Error('DB error'));
    await expect(service.save()).rejects.toThrow('DB error');
  });
});
```

---

## Continuous Integration

### GitHub Actions (Example)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

      - name: Upload coverage
        uses: codecov/codecov-action@v2
        with:
          files: ./coverage/lcov.info
```

---

## Common Issues

### 1. **Mock Not Working**

```javascript
// ❌ Wrong - mock after import
const service = require('../service');
jest.mock('../dependency');

// ✅ Correct - mock before import
jest.mock('../dependency');
const service = require('../service');
```

### 2. **Async Test Timeout**

```javascript
// Increase timeout in jest.config.js
module.exports = {
  testTimeout: 10000, // 10 seconds
};

// Or per test
it('slow test', async () => {
  // ...
}, 15000); // 15 seconds
```

### 3. **Module Not Found**

```bash
# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules
npm install
```

---

## Test Commands Reference

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:verbose` | Run tests with verbose output |
| `npx jest --clearCache` | Clear Jest cache |
| `npx jest <file>` | Run specific test file |
| `npx jest --updateSnapshot` | Update snapshots |

---

## Coverage Goals

### Current Status

- ✅ **DynamoDB Service**: 97.87% coverage
- ✅ **S3 Service**: 100% coverage
- ✅ **SQS Consumer**: 76.19% coverage
- ⚠️ **Screenshot Service**: Needs tests (currently 8%)

### Next Steps

1. ✅ Add tests for core services (completed)
2. ⏳ Add tests for Screenshot Service (Puppeteer mocking)
3. ⏳ Add integration tests for end-to-end flows
4. ⏳ Add performance tests for concurrent processing

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Jest Matchers](https://jestjs.io/docs/expect)
- [Mocking in Jest](https://jestjs.io/docs/mock-functions)
- [Testing Best Practices](https://testingjavascript.com/)

---

## Summary

✅ **Unit tests implemented** for core services
✅ **Coverage reports** configured and working
✅ **Mocking strategy** established for AWS SDK
✅ **Test scripts** added to package.json
✅ **CI-ready** test configuration

**Current test coverage: 60%+** with comprehensive tests for:
- DynamoDB operations
- S3 uploads
- SQS message handling
- Error handling
- Race condition prevention

Run `npm test` to execute all tests! 🚀
