# Scaling Guide

## Overview

Service này được thiết kế để scale horizontally với nhiều ECS containers/instances chạy song song.

## ✅ Safe to Scale

### 1. SQS Message Processing

- **Cơ chế**: SQS sử dụng visibility timeout để đảm bảo mỗi message chỉ được 1 consumer xử lý
- **Default visibility timeout**: 300 seconds (5 phút)
- **Behavior**: Khi 1 consumer nhận message, message sẽ invisible với các consumers khác trong 300s
- **Auto-delete**: Messages được tự động delete sau khi xử lý thành công

### 2. DynamoDB Operations

- **Race Condition Prevention**: Sử dụng conditional write (`attribute_not_exists(id)`)
- **Duplicate Detection**: Check status trước khi xử lý
- **Atomic Operations**: Mỗi screenshot có unique ID

### 3. S3 Storage

- **No Conflicts**: Mỗi screenshot có unique path dựa trên `screenshotId`
- **Concurrent Uploads**: S3 hỗ trợ concurrent uploads từ nhiều sources

## 🔧 Race Condition Prevention

### Scenario: 2 containers nhận cùng message

```
Container A                    Container B
    |                              |
    |-- Receive Message -----------|-- Receive Message (duplicate/retry)
    |                              |
    |-- Check DynamoDB ------------|-- Check DynamoDB
    |   (not exists)               |   (not exists)
    |                              |
    |-- Conditional Write ---------|-- Conditional Write
    |   ✅ SUCCESS                 |   ❌ FAIL (already exists)
    |                              |
    |-- Process screenshot --------|-- Skip (return success)
    |                              |
    |-- Update to 'success' -------|
```

### Implementation Details

#### 1. Initial Status Check

```javascript
const existingScreenshot = await dynamodbService.getScreenshot(screenshotId);

// Already completed - skip
if (existingScreenshot?.status === 'success') {
  return { success: true, skipped: true, s3Url: existingScreenshot.s3Url };
}

// Being processed by another instance - skip
if (existingScreenshot?.status === 'processing') {
  return { success: true, skipped: true, reason: 'already_processing' };
}
```

#### 2. Conditional Write (Critical Section)

```javascript
try {
  await dynamodbService.saveScreenshotResult(
    { screenshotId, status: 'processing', ... },
    { onlyIfNotExists: true }  // ← Prevents race condition
  );
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    // Another instance won the race - skip
    return { success: true, skipped: true, reason: 'race_condition_prevented' };
  }
  throw error;
}
```

## ⚙️ Configuration for Scaling

### ECS Task Definition

```json
{
  "containerDefinitions": [
    {
      "cpu": 512,
      "memory": 1024,
      "environment": [
        {
          "name": "SQS_BATCH_SIZE",
          "value": "5" // Process up to 5 messages concurrently per container
        },
        {
          "name": "SQS_VISIBILITY_TIMEOUT",
          "value": "300" // 5 minutes - ensure > processing time
        }
      ]
    }
  ]
}
```

### Auto Scaling Policy (Recommended)

```yaml
# Based on SQS Queue Depth
TargetTrackingScaling:
  - Type: TargetTrackingScaling
    TargetValue: 100 # Target: 100 messages per instance
    ScaleInCooldown: 300
    ScaleOutCooldown: 60
    CustomizedMetricSpecification:
      MetricName: ApproximateNumberOfMessagesVisible
      Namespace: AWS/SQS
      Statistic: Average
```

## 📊 Monitoring Metrics

### Key Metrics to Watch

1. **SQS Metrics**
   - `ApproximateNumberOfMessagesVisible`: Messages waiting to be processed
   - `ApproximateAgeOfOldestMessage`: Processing lag
   - `NumberOfMessagesReceived`: Throughput
   - `NumberOfMessagesDeleted`: Success rate

2. **DynamoDB Metrics**
   - `ConditionalCheckFailedRequests`: Race conditions prevented
   - `UserErrors`: Validation issues
   - `ThrottledRequests`: Capacity issues

3. **Application Metrics (Logs)**
   - Screenshots skipped (already success)
   - Screenshots skipped (already processing)
   - Screenshots skipped (race condition prevented)
   - Processing duration

## 🎯 Scaling Recommendations

### Small Workload (< 100 screenshots/hour)

- **Instances**: 1-2 containers
- **CPU/Memory**: 512 CPU / 1024 MB
- **SQS Batch Size**: 3-5

### Medium Workload (100-1000 screenshots/hour)

- **Instances**: 2-5 containers
- **CPU/Memory**: 1024 CPU / 2048 MB
- **SQS Batch Size**: 5-10

### Large Workload (> 1000 screenshots/hour)

- **Instances**: 5-20 containers (auto-scale)
- **CPU/Memory**: 1024-2048 CPU / 2048-4096 MB
- **SQS Batch Size**: 10
- **Enable**: Auto-scaling based on queue depth

## ⚠️ Important Considerations

### 1. Visibility Timeout

- **Must be > processing time**: Nếu processing time > visibility timeout, message có thể được process 2 lần
- **Current default**: 300s (5 minutes)
- **Recommendation**: Monitor `p99` processing time và set visibility timeout = `p99 * 2`

### 2. DynamoDB Capacity

- **On-demand mode**: Tự động scale (recommended)
- **Provisioned mode**: Cần tăng capacity khi scale containers
- **GSI**: Đảm bảo GSI cũng có đủ capacity

### 3. S3 Request Rate

- **Default**: 3,500 PUT/COPY/POST/DELETE or 5,500 GET/HEAD per second per prefix
- **Optimization**: Sử dụng random prefix nếu cần throughput cao hơn

### 4. Puppeteer/Chromium Resources

- **Memory intensive**: Mỗi browser instance cần ~200-500MB
- **Recommendation**: Reuse browser instance (current implementation ✅)
- **CPU**: Screenshot rendering cần CPU, monitor CPU usage

## 🧪 Testing Scaling

### Load Test Script

```javascript
// scripts/load-test.js
const { SQS } = require('@aws-sdk/client-sqs');

async function sendMultipleMessages(count) {
  const sqs = new SQS({ region: 'us-east-1' });

  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(
      sqs.sendMessage({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify({
          url: `https://example.com/page${i}`,
          requestId: `load-test-${Date.now()}-${i}`,
        }),
      })
    );
  }

  await Promise.all(promises);
  console.log(`✅ Sent ${count} messages`);
}

sendMultipleMessages(100); // Send 100 concurrent messages
```

### Verification

1. Send nhiều messages cùng lúc
2. Scale up containers
3. Monitor logs for:
   - ✅ `race_condition_prevented` messages
   - ✅ All messages processed successfully
   - ✅ No duplicate screenshots created
   - ✅ Messages deleted from queue

## 📝 Best Practices

1. **Always use requestId**: Để track và prevent duplicates
2. **Monitor CloudWatch**: Set alarms cho queue depth và error rate
3. **Use auto-scaling**: Tự động scale based on demand
4. **Log structured data**: Để dễ query và debug
5. **Set appropriate timeouts**: Visibility timeout > processing time
6. **Test failover**: Ensure service handles container crashes gracefully

## 🔍 Troubleshooting

### Symptom: Messages không được delete

- **Check**: Xem handleMessage có throw error không
- **Check**: Visibility timeout đủ dài không
- **Check**: Event `message_processed` có fire không

### Symptom: Duplicate screenshots được tạo

- **Check**: DynamoDB conditional write có được enable không
- **Check**: Logs có `ConditionalCheckFailedException` không
- **Check**: `screenshotId` có unique không

### Symptom: Processing chậm khi scale

- **Check**: DynamoDB throttling
- **Check**: S3 rate limits
- **Check**: Container CPU/memory limits
- **Check**: SQS batch size configuration
