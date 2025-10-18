# Retry Mechanism

## Overview

Service có 2 level retry để handle transient errors:

1. **Application-level retry** - Retry trong code (3 attempts)
2. **SQS-level retry** - Retry qua SQS redrive policy (3 attempts)

---

## 1. Application-Level Retry (In-Process)

### Implementation

**File**: `src/services/sqsConsumer.js`

```javascript
const maxRetries = 3;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    screenshot = await screenshotService.captureScreenshot({
      url,
      width,
      height,
      format,
      quality,
      fullPage,
    });

    logger.info({ screenshotId, url, attempt }, 'Screenshot captured successfully');
    break; // Success - exit retry loop
  } catch (error) {
    logger.warn(
      { screenshotId, url, attempt, maxRetries, err: error },
      `Screenshot capture failed (attempt ${attempt}/${maxRetries})`
    );

    if (attempt === maxRetries) {
      throw error; // Final attempt failed
    }

    // Exponential backoff: 1s, 2s, 4s (max 5s)
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
```

### When It Retries

- **Transient network errors**
- **Page load timeouts** (temporary)
- **Browser crashes**
- **Memory issues**

### Retry Delays

- Attempt 1 → Fail → Wait 1 second
- Attempt 2 → Fail → Wait 2 seconds
- Attempt 3 → Fail → Throw error (SQS retry)

### Benefits

✅ Fast recovery from transient errors
✅ No need to return message to SQS
✅ Exponential backoff prevents overwhelming target site
✅ Detailed logging per attempt

---

## 2. SQS-Level Retry (Message Redelivery)

### Configuration

**File**: `scripts/init-awslocal.sh`

```bash
# Dead Letter Queue for failed messages
DLQ: screenshot-queue-dlq

# Main Queue with Redrive Policy
Queue: screenshot-queue
  - maxReceiveCount: 3        # Retry 3 times
  - VisibilityTimeout: 300s   # 5 minutes
  - DeadLetterQueue: screenshot-queue-dlq
```

### How It Works

1. **Message received** → Processing starts
2. **If processing fails** → Message returns to queue after visibility timeout
3. **ReceiveCount increases** (1 → 2 → 3)
4. **After 3 failures** → Message moved to Dead Letter Queue

### Retry Flow

```
Attempt 1: Process → Fail → Return to queue after 5min
Attempt 2: Process → Fail → Return to queue after 5min
Attempt 3: Process → Fail → Return to queue after 5min
Attempt 4: Process → Fail → Move to DLQ (permanent failure)
```

### Dead Letter Queue (DLQ)

**Purpose**: Store permanently failed messages for:

- Manual investigation
- Debugging
- Reprocessing after fixes

**How to check DLQ:**

```bash
# View messages in DLQ
docker compose exec app sh -c "
  aws --endpoint-url=http://localstack:4566 sqs receive-message \
    --queue-url http://localstack:4566/000000000000/screenshot-queue-dlq
"
```

---

## Combined Retry Strategy

### Total Retry Attempts

**Application retries × SQS retries = Total attempts**

- 3 × 3 = **9 total attempts** per message

### Timeline Example

```
Message arrives at t=0

=== SQS Attempt 1 (t=0) ===
  App Attempt 1: t=0    → Fail → Wait 1s
  App Attempt 2: t=1s   → Fail → Wait 2s
  App Attempt 3: t=3s   → Fail → Throw error
  → Message returns to queue (t=300s)

=== SQS Attempt 2 (t=300s) ===
  App Attempt 1: t=300s → Fail → Wait 1s
  App Attempt 2: t=301s → Fail → Wait 2s
  App Attempt 3: t=303s → Fail → Throw error
  → Message returns to queue (t=600s)

=== SQS Attempt 3 (t=600s) ===
  App Attempt 1: t=600s → Fail → Wait 1s
  App Attempt 2: t=601s → Fail → Wait 2s
  App Attempt 3: t=603s → Fail → Throw error
  → Message returns to queue (t=900s)

=== SQS Attempt 4 (t=900s) ===
  → maxReceiveCount exceeded
  → Move to DLQ ❌
```

---

## Error Types & Retry Strategy

### ✅ Retriable Errors (Transient)

**Network errors:**

```
TimeoutError: Navigation timeout
ERR_CONNECTION_REFUSED
```

**Action**: Retry immediately ✅

**Browser errors:**

```
Browser crashed unexpectedly
Out of memory
```

**Action**: Retry immediately ✅

**Rate limiting:**

```
HTTP 429: Too Many Requests
```

**Action**: Retry with backoff ✅

### ❌ Non-Retriable Errors (Permanent)

**Invalid URL:**

```
Protocol error: Cannot navigate to invalid URL
```

**Action**: Don't retry, mark as failed ❌

**Authentication required:**

```
HTTP 401/403: Unauthorized/Forbidden
```

**Action**: Don't retry, mark as failed ❌

**Not found:**

```
HTTP 404: Not Found
```

**Action**: Don't retry, mark as failed ❌

---

## Monitoring & Debugging

### CloudWatch Logs - Search for:

**Application retries in progress:**

```
"Screenshot capture failed (attempt 1/3)"
"Screenshot capture failed (attempt 2/3)"
```

**All retries exhausted:**

```
"Screenshot capture failed after all retries"
```

**SQS redelivery:**

```
level: "info" AND "Processing screenshot message"
// Check messageId appears multiple times
```

### CloudWatch Metrics

**SQS Queue:**

- `ApproximateNumberOfMessagesVisible` - Messages waiting
- `ApproximateNumberOfMessagesNotVisible` - Messages being processed
- `NumberOfMessagesSent` - Total messages
- `NumberOfMessagesDeleted` - Successful processing

**Dead Letter Queue:**

- `ApproximateNumberOfMessagesVisible` - Failed messages count
- Should be **0** in healthy system

---

## Best Practices

### 1. Set Appropriate Visibility Timeout

```bash
VisibilityTimeout = (Processing time + Retry delays) × Safety factor

Example:
- Average processing: 30s
- Max retries: 3 × 5s = 15s
- Safety factor: 2x
→ VisibilityTimeout = (30 + 15) × 2 = 90s

Current: 300s (5 minutes) - safe for complex pages
```

### 2. Monitor DLQ

```bash
# Setup CloudWatch alarm
Metric: ApproximateNumberOfMessagesVisible
Threshold: > 0
Action: Send notification to ops team
```

### 3. Reprocess DLQ Messages

After fixing issues, reprocess failed messages:

```bash
# Move messages from DLQ back to main queue
aws sqs receive-message --queue-url $DLQ_URL --max-number 10 | \
  jq -r '.Messages[].Body' | \
  while read body; do
    aws sqs send-message --queue-url $QUEUE_URL --message-body "$body"
  done
```

### 4. Add Retry Metadata

Track retry count in message body:

```javascript
{
  "url": "https://example.com",
  "requestId": "...",
  "retryCount": 0,  // Increment on each app-level retry
  "originalTimestamp": "2025-10-18T10:00:00Z"
}
```

---

## Configuration

### Environment Variables

```bash
# SQS Configuration
SQS_VISIBILITY_TIMEOUT=300          # 5 minutes
SQS_MAX_RECEIVE_COUNT=3             # 3 SQS-level retries

# Application Configuration
SCREENSHOT_MAX_RETRIES=3            # 3 app-level retries
SCREENSHOT_RETRY_DELAY_MS=1000      # Initial delay (exponential)
SCREENSHOT_MAX_RETRY_DELAY_MS=5000  # Max delay cap
```

### Update config/index.js

```javascript
sqs: {
  queueUrl: process.env.SQS_QUEUE_URL,
  visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '300', 10),
  maxReceiveCount: parseInt(process.env.SQS_MAX_RECEIVE_COUNT || '3', 10),
},

screenshot: {
  maxRetries: parseInt(process.env.SCREENSHOT_MAX_RETRIES || '3', 10),
  retryDelayMs: parseInt(process.env.SCREENSHOT_RETRY_DELAY_MS || '1000', 10),
  maxRetryDelayMs: parseInt(process.env.SCREENSHOT_MAX_RETRY_DELAY_MS || '5000', 10),
},
```

---

## Troubleshooting

### Issue: Messages stuck in queue

**Symptoms:**

- Messages not being processed
- Queue depth increasing

**Check:**

1. Container health: `docker compose ps`
2. Consumer logs: `docker compose logs app`
3. Queue visibility: Messages might be invisible while processing

### Issue: Too many retries

**Symptoms:**

- Same URL failing repeatedly
- DLQ filling up

**Solutions:**

1. Check if URL is valid
2. Check if target site is blocking
3. Increase timeout for slow sites
4. Add URL to blacklist if permanently broken

### Issue: Not enough retries

**Symptoms:**

- Transient errors causing failures
- Success rate lower than expected

**Solutions:**

1. Increase `maxRetries` in code
2. Increase `maxReceiveCount` in SQS
3. Adjust visibility timeout
4. Add longer delays between retries

---

## Summary

✅ **Application-level retries**: Fast recovery from transient errors (3 attempts with exponential backoff)

✅ **SQS-level retries**: Handle persistent issues or container crashes (3 redeliveries after 5 min visibility timeout)

✅ **Dead Letter Queue**: Capture permanently failed messages for investigation

✅ **Total**: Up to 9 attempts per message (3 × 3)

✅ **Configurable**: All retry parameters can be tuned via environment variables

This multi-layer retry strategy ensures high reliability while preventing infinite loops! 🚀
