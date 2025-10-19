# Screenshot Status Flow

## Status Overview

The screenshot service uses a 4-state status flow to track the lifecycle of each screenshot request:

```
processing → consumerProcessing → success/failed
```

## Status Definitions

### 1. `processing`

- **When**: Created when SQS message is sent (before consumer picks it up)
- **Created By**: `send-test-message.js` script or API endpoint
- **Meaning**: Request is queued in SQS, waiting for a consumer to process it
- **DynamoDB Record**: Contains initial request parameters (url, width, height, format)
- **Next Status**: `consumerProcessing` when consumer starts processing

### 2. `consumerProcessing`

- **When**: Updated when SQS consumer begins actively processing the request
- **Created By**: `sqsConsumer.js` - handleMessage function
- **Meaning**: Consumer has received the message and is actively capturing/uploading screenshot
- **Purpose**:
  - Distinguish between "queued" and "actively processing"
  - Detect stale processing (timeout after 10 minutes)
  - Prevent duplicate processing by other consumers
- **Next Status**: `success` or `failed` when processing completes

### 3. `success`

- **When**: Screenshot captured and uploaded to S3 successfully
- **Created By**: `sqsConsumer.js` after successful S3 upload
- **Meaning**: Request completed successfully, screenshot available
- **DynamoDB Record**: Contains `s3Url` and `s3Key` for the screenshot
- **Next Status**: None (terminal state)

### 4. `failed`

- **When**: Error occurred during screenshot capture or S3 upload
- **Created By**: `sqsConsumer.js` error handler
- **Meaning**: Request failed, will be retried by SQS (up to 3 times)
- **DynamoDB Record**: Contains `errorMessage` with failure details
- **Next Status**:
  - May transition to `consumerProcessing` if SQS retries
  - Remains `failed` if max retries exceeded (moves to DLQ)

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User sends request (send-test-message.js or API)            │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │ Create DynamoDB record        │
        │ Status: "processing"          │
        │ Contains: url, width, height  │
        └───────────┬───────────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │ Send message to SQS queue     │
        └───────────┬───────────────────┘
                    │
                    │ (Message waits in queue)
                    │
                    ▼
        ┌───────────────────────────────┐
        │ Consumer receives message     │
        │ (sqsConsumer.js)              │
        └───────────┬───────────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │ Check existing record status  │
        └───────────┬───────────────────┘
                    │
                    ├─ If "success" ────────────→ Skip (already done)
                    │
                    ├─ If "consumerProcessing" ──→ Check if stale
                    │                               │
                    │                               ├─ Fresh → Skip
                    │                               └─ Stale → Continue
                    │
                    └─ If "processing" ────────────→ Continue (normal flow)

                    │
                    ▼
        ┌───────────────────────────────┐
        │ Update DynamoDB                │
        │ Status: "consumerProcessing"  │
        └───────────┬───────────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │ Capture screenshot             │
        │ (Puppeteer)                    │
        └───────────┬───────────────────┘
                    │
                    ├─ Error ──────────────────────┐
                    │                               │
                    ▼                               ▼
        ┌───────────────────────┐    ┌─────────────────────────┐
        │ Upload to S3          │    │ Update DynamoDB         │
        └───────────┬───────────┘    │ Status: "failed"        │
                    │                 │ errorMessage: ...       │
                    ├─ Error ─────────▶                         │
                    │                 └────────┬────────────────┘
                    ▼                          │
        ┌───────────────────────┐              │
        │ Update DynamoDB       │              ▼
        │ Status: "success"     │    ┌─────────────────────────┐
        │ s3Url: ...            │    │ Throw error             │
        │ s3Key: ...            │    │ (SQS will retry)        │
        └───────────┬───────────┘    └─────────────────────────┘
                    │
                    ▼
                  DONE
```

## Consumer Logic

### Race Condition Prevention

The consumer implements several checks to prevent duplicate processing:

1. **Success Check**: If status is already `success`, skip processing entirely
2. **Active Processing Check**: If status is `consumerProcessing` and not stale (< 10 min), skip
3. **Stale Detection**: If `consumerProcessing` for > 10 minutes, retry (assume consumer crashed)

### Why Two "Processing" States?

**Problem without `consumerProcessing`:**

- Consumer A picks up message, starts processing
- Consumer B receives same message (SQS visibility timeout race)
- Both consumers see status = "processing" and think it's fresh work
- Both process the same request (wasted resources)

**Solution with `consumerProcessing`:**

- Consumer A updates to `consumerProcessing` immediately
- Consumer B sees `consumerProcessing` (recent) and skips
- Only Consumer A processes the request

## Query Examples

```bash
# View queued requests
yarn query-screenshots processing

# View actively processing requests
yarn query-screenshots consumerProcessing

# View successful screenshots
yarn query-screenshots success

# View failed requests
yarn query-screenshots failed

# Get specific screenshot by requestId
yarn get-screenshot <requestId>
```

## Monitoring

### Key Metrics to Track

1. **Processing Queue Depth**: Count of `processing` status
   - High value → Consumers can't keep up with load

2. **Active Processing**: Count of `consumerProcessing` status
   - Should roughly match number of active consumers

3. **Stale Processing**: Count of `consumerProcessing` > 10 minutes
   - Non-zero → Consumers crashing during processing

4. **Failed Rate**: Percentage of `failed` vs total requests
   - High rate → Investigate error messages

### DynamoDB Query by Status

```javascript
// Count by status
const processing = await dynamodbService.queryScreenshotsByStatus('processing');
const consumerProcessing = await dynamodbService.queryScreenshotsByStatus('consumerProcessing');
const success = await dynamodbService.queryScreenshotsByStatus('success');
const failed = await dynamodbService.queryScreenshotsByStatus('failed');

console.log({
  queued: processing.length,
  active: consumerProcessing.length,
  completed: success.length,
  errors: failed.length,
});
```

## Troubleshooting

### High number of `consumerProcessing` status

**Symptoms**: Many requests stuck in `consumerProcessing`

**Possible Causes**:

1. Consumer containers crashing during processing
2. Network issues preventing S3 upload
3. Screenshot capture taking too long (timeout)

**Solution**:

- Check consumer logs for errors
- Verify S3 connectivity
- Consider increasing stale timeout (currently 10 min)

### Requests stuck in `processing`

**Symptoms**: Requests never transition to `consumerProcessing`

**Possible Causes**:

1. No active consumers running
2. SQS queue misconfigured
3. Consumers not polling queue

**Solution**:

- Verify consumers are running: `docker compose ps`
- Check SQS queue metrics in AWS console/LocalStack
- Review consumer startup logs

### Duplicate processing (despite status checks)

**Symptoms**: Same screenshot processed multiple times

**Possible Causes**:

1. SQS visibility timeout too short
2. Consumer not updating status fast enough
3. DynamoDB eventual consistency

**Solution**:

- Increase SQS visibility timeout (currently 300s)
- Add DynamoDB conditional writes (already implemented)
- Enable DynamoDB strong consistency for reads

## Related Files

- **Status Creation**:
  - `scripts/send-test-message.js` - Creates `processing` status

- **Status Updates**:
  - `src/services/sqsConsumer.js` - Updates to `consumerProcessing`, `success`, `failed`

- **Status Queries**:
  - `scripts/query-screenshots.js` - Query by status
  - `scripts/get-screenshot.js` - Get specific screenshot

- **DynamoDB Operations**:
  - `src/services/dynamodbService.js` - Status CRUD operations
