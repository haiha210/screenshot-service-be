# Scaling Implementation Summary

## ✅ Changes Made

### 1. Race Condition Prevention

**Problem**: Khi scale nhiều ECS containers, có thể có 2+ containers cùng lúc nhận message với cùng `screenshotId` và cùng bắt đầu xử lý, gây ra duplicate screenshots.

**Solution**: Sử dụng DynamoDB Conditional Write với `attribute_not_exists(id)` để đảm bảo chỉ 1 container được phép tạo record.

#### Code Changes

**File**: `src/services/dynamodbService.js`

```javascript
async saveScreenshotResult(data, options = {}) {
  const { onlyIfNotExists = false } = options;

  const commandParams = {
    TableName: config.dynamodb.tableName,
    Item: item,
  };

  // Add conditional expression to prevent overwriting existing items
  if (onlyIfNotExists) {
    commandParams.ConditionExpression = 'attribute_not_exists(id)';
  }

  await dynamoDBDocClient.send(new PutCommand(commandParams));
}
```

**File**: `src/services/sqsConsumer.js`

```javascript
// Check if already being processed
if (existingScreenshot && existingScreenshot.status === 'processing') {
  logger.info('Screenshot is being processed by another instance, skipping');
  return { success: true, skipped: true, reason: 'already_processing' };
}

// Conditional write to prevent race condition
try {
  await dynamodbService.saveScreenshotResult(
    { screenshotId, status: 'processing', ... },
    { onlyIfNotExists: true }  // ← Key change
  );
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    logger.info('Screenshot already being processed by another instance');
    return { success: true, skipped: true, reason: 'race_condition_prevented' };
  }
  throw error;
}
```

### 2. Enhanced Logging

Added detailed logging to track:

- Race condition prevention
- Duplicate detection
- Processing state
- Message deletion

### 3. Documentation

Created comprehensive documentation:

- **docs/SCALING.md**: Complete scaling guide
  - Race condition explanation
  - Monitoring metrics
  - Configuration recommendations
  - Troubleshooting guide

- **Updated README.md**: Added scaling section with link to detailed guide

### 4. Load Testing Script

Created `scripts/load-test.js` for testing concurrent processing:

```bash
# Test với 100 messages
yarn load-test 100

# Test race condition với duplicate requestId
yarn load-test:duplicates 50
```

Features:

- Send multiple messages concurrently
- Test duplicate detection
- Performance metrics
- Error reporting

## 🎯 How It Works

### Normal Flow (No Race Condition)

```
Message arrives → Check DynamoDB → Not exists → Conditional Write (✅ Success) → Process → Update to 'success'
```

### Race Condition Flow

```
Container A                          Container B
    |                                     |
    |-- Check DynamoDB ------------------|-- Check DynamoDB
    |   (not exists)                     |   (not exists)
    |                                     |
    |-- Conditional Write (✅ SUCCESS) ---|-- Conditional Write (❌ FAIL)
    |                                     |
    |-- Process screenshot ---------------|-- Skip & return success
    |                                     |
    |-- Update to 'success' --------------|
```

### Benefits

1. ✅ **No Duplicate Screenshots**: Conditional write ensures only 1 container processes
2. ✅ **Safe to Scale**: Can scale to nhiều containers without conflicts
3. ✅ **Automatic Retry**: Failed containers won't affect processing
4. ✅ **Message Deletion**: All cases return success → message deleted from SQS
5. ✅ **Cost Efficient**: Avoid wasting resources on duplicate processing

## 🧪 Testing

### 1. Test Normal Scaling

```bash
# Start service
docker compose up -d

# Send 100 messages
yarn load-test 100

# Monitor logs
docker compose logs -f app

# Check results
yarn query-screenshots
```

Expected:

- All 100 messages processed successfully
- 100 unique screenshots created
- No errors in logs

### 2. Test Race Condition Prevention

```bash
# Send 50 messages with SAME requestId
yarn load-test:duplicates 50

# Monitor logs - should see:
# - 1 message processes successfully
# - 49 messages skipped (race_condition_prevented)

# Check DynamoDB
yarn query-screenshots
# Should see only 1 screenshot created
```

### 3. Test Multi-Container Scaling

```bash
# Scale to 3 containers
docker compose up -d --scale app=3

# Send many messages
yarn load-test 200

# All messages should be processed correctly
# No duplicates should be created
```

## 📊 Monitoring

### Key Logs to Watch

1. **Race condition prevented**:

```json
{
  "level": "info",
  "msg": "Screenshot already being processed by another instance (conditional write failed)",
  "screenshotId": "...",
  "reason": "race_condition_prevented"
}
```

2. **Duplicate detection**:

```json
{
  "level": "info",
  "msg": "Screenshot already processed successfully, skipping",
  "status": "success",
  "skipped": true
}
```

3. **Processing by another instance**:

```json
{
  "level": "info",
  "msg": "Screenshot is being processed by another instance, skipping",
  "status": "processing",
  "reason": "already_processing"
}
```

### CloudWatch Metrics

Monitor these metrics in production:

- `ConditionalCheckFailedRequests` (DynamoDB) - Should be low
- `ApproximateNumberOfMessagesVisible` (SQS) - Queue depth
- Processing duration percentiles (p50, p95, p99)

## 🚀 Deployment Recommendations

### ECS Auto Scaling

```yaml
TargetTrackingScaling:
  TargetValue: 100 # 100 messages per container
  ScaleInCooldown: 300
  ScaleOutCooldown: 60
  MetricType: SQSQueueDepth
```

### Task Configuration

```json
{
  "cpu": "1024",
  "memory": "2048",
  "desiredCount": 2,
  "minimumHealthyPercent": 100,
  "maximumPercent": 200
}
```

### Environment Variables

```bash
SQS_BATCH_SIZE=1                    # Process 1 message at a time
SQS_VISIBILITY_TIMEOUT=300          # 5 minutes
LOG_LEVEL=info                      # Production logging
```

## ✅ Verification Checklist

Before deploying to production:

- [ ] Tested with load-test script (100+ messages)
- [ ] Tested race condition prevention (load-test:duplicates)
- [ ] Tested with multiple containers (docker compose --scale)
- [ ] Verified no duplicate screenshots created
- [ ] Verified all messages deleted from queue
- [ ] Checked CloudWatch logs for errors
- [ ] Verified DynamoDB conditional write errors are handled
- [ ] Tested auto-scaling configuration
- [ ] Set up CloudWatch alarms for queue depth
- [ ] Documented scaling limits and thresholds

## 📝 Notes

- DynamoDB conditional write có thể fail tạm thời do throttling → Retry logic đã có sẵn trong SQS
- Visibility timeout phải > p99 processing time để tránh duplicate processing
- Monitor `ConditionalCheckFailedException` - nếu quá cao, có thể có issue với message distribution
- SQS automatically handles message distribution giữa các consumers

## 🔗 Related Documentation

- [SCALING.md](./SCALING.md) - Comprehensive scaling guide
- [README.md](../README.md) - Project overview and setup
- [AWS DynamoDB Conditional Writes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html#WorkingWithItems.ConditionalUpdate)
- [SQS Visibility Timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
