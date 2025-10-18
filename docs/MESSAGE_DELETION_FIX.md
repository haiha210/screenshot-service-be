# SQS Message Deletion Fix

## Problem

Messages were not being deleted from SQS queue after successful processing. The same message kept being received multiple times:

```
[11:15:47] Processing screenshot message (messageId: 55c8a5e9...)
[11:20:47] Processing screenshot message (messageId: 55c8a5e9...)  ← Same message!
[12:01:39] Processing screenshot message (messageId: 55c8a5e9...)  ← Again!
```

## Root Cause

The `handleMessage` function was **returning objects** instead of **returning void**:

```javascript
// ❌ WRONG - Returning object prevents message deletion
if (existingScreenshot?.status === 'success') {
  return {
    success: true,
    screenshotId,
    s3Url: existingScreenshot.s3Url,
    skipped: true,
  };
}
```

According to `sqs-consumer` documentation:

- ✅ **Success** = Function completes without throwing error (returns void or undefined)
- ❌ **Failure** = Function throws error

When we returned an object, the library didn't recognize it as a successful completion, so the message was never deleted.

## Solution

Change all return statements to **return void** (no value):

```javascript
// ✅ CORRECT - Return nothing (void)
if (existingScreenshot?.status === 'success') {
  logger.info(
    {
      screenshotId,
      url,
      status: existingScreenshot.status,
      s3Url: existingScreenshot.s3Url,
    },
    'Screenshot already processed successfully, skipping (message will be deleted)'
  );
  return; // ← Return nothing
}
```

## Changes Made

### 1. Skip Already Successful Screenshots

**Before:**

```javascript
if (existingScreenshot && existingScreenshot.status === 'success') {
  return {
    success: true,
    screenshotId,
    s3Url: existingScreenshot.s3Url,
    skipped: true,
  };
}
```

**After:**

```javascript
if (existingScreenshot && existingScreenshot.status === 'success') {
  logger.info(
    {
      screenshotId,
      url,
      status: existingScreenshot.status,
      s3Url: existingScreenshot.s3Url,
    },
    'Screenshot already processed successfully, skipping (message will be deleted)'
  );
  return; // ← No return value
}
```

### 2. Skip Already Processing Screenshots

**Before:**

```javascript
logger.info({ screenshotId, url }, 'Screenshot is being processed by another instance');
return {
  success: true,
  screenshotId,
  skipped: true,
  reason: 'already_processing',
};
```

**After:**

```javascript
logger.info(
  { screenshotId, url },
  'Screenshot is being processed by another instance, skipping (message will be deleted)'
);
return; // ← No return value
```

### 3. Race Condition Prevention

**Before:**

```javascript
if (error.name === 'ConditionalCheckFailedException') {
  logger.info({ screenshotId, url }, 'Screenshot already being processed');
  return {
    success: true,
    screenshotId,
    skipped: true,
    reason: 'race_condition_prevented',
  };
}
```

**After:**

```javascript
if (error.name === 'ConditionalCheckFailedException') {
  logger.info(
    { screenshotId, url },
    'Screenshot already being processed by another instance (conditional write failed, message will be deleted)'
  );
  return; // ← No return value
}
```

### 4. Successful Processing

**Before:**

```javascript
logger.info({ screenshotId, url, s3Url }, 'Screenshot processed successfully');
return {
  success: true,
  screenshotId,
  s3Url: uploadResult.url,
};
```

**After:**

```javascript
logger.info(
  { screenshotId, url, s3Url },
  'Screenshot processed successfully (message will be deleted)'
);
// ← No return statement
```

## Verification

### Expected Behavior

After the fix, messages should be deleted after successful processing:

```log
[12:17:10.543] DEBUG: Message received from SQS
[12:17:10.584] INFO: Screenshot result saved successfully
[12:17:15.836] INFO: Screenshot captured successfully
[12:17:15.900] INFO: Screenshot processed successfully (message will be deleted)
[12:17:15.904] INFO: Message processed successfully and deleted from queue  ← ✅ This!
```

### Test Commands

```bash
# 1. Send test message
docker compose exec app node scripts/send-test-message.js github.com
# Note the requestId: 95572890-566e-4912-84e6-4b547645171a

# 2. Check processing logs
docker compose logs app --tail=50 | grep "Message received"
# Should see only 1 message received

# 3. Verify screenshot success
docker compose exec app yarn get-screenshot 95572890-566e-4912-84e6-4b547645171a
# Should show status: success

# 4. Wait 5+ minutes and check logs again
sleep 300
docker compose logs app --since=5m | grep "95572890-566e-4912-84e6-4b547645171a"
# Should NOT see duplicate processing
```

## Key Learnings

### 1. `sqs-consumer` Message Deletion Logic

```javascript
// ✅ Message will be DELETED
async function handleMessage(message) {
  // ... process message ...
  // Don't return anything or return undefined
}

// ❌ Message will NOT be deleted (treated as failure)
async function handleMessage(message) {
  // ... process message ...
  return { success: true }; // ← Don't do this!
}
```

### 2. Configuration Required

Both are needed for automatic deletion:

```javascript
const consumer = Consumer.create({
  queueUrl: config.sqs.queueUrl,
  handleMessage, // ← Must not throw error
  shouldDeleteMessages: true, // ← Must be enabled
});
```

### 3. Event Handling

Monitor these events to verify deletion:

```javascript
consumer.on('message_processed', (message) => {
  logger.info({ messageId: message.MessageId }, 'Message deleted');
});

consumer.on('processing_error', (err) => {
  logger.error({ err }, 'Message will be retried (not deleted)');
});
```

## Impact

### Before Fix

```
Message Flow:
  1. Receive message → Process → Return object
  2. Message NOT deleted
  3. After visibility timeout → Receive same message again
  4. Skip processing (already success) → Return object
  5. Message NOT deleted
  6. Loop continues forever ♾️
```

### After Fix

```
Message Flow:
  1. Receive message → Process → Return void
  2. Message DELETED ✅
  3. Never see this message again
```

## Related Files

- **src/services/sqsConsumer.js** - Main handler function
- **docs/RETRY_MECHANISM.md** - Retry strategy documentation
- **docs/RACE_CONDITION_FIX.md** - Concurrent processing protection

## Testing Results

```bash
# Test 1: Single message
✅ Message received once
✅ Processed successfully
✅ Deleted from queue
✅ No duplicates after 5+ minutes

# Test 2: Batch messages (5 concurrent)
✅ All 5 messages received
✅ All processed successfully
✅ All deleted from queue
✅ No duplicates

# Test 3: Failed message
✅ Message received
❌ Processing failed (error thrown)
✅ Message NOT deleted (retry)
✅ Moved to DLQ after 3 retries

# Test 4: Duplicate requestId
✅ First message: Processed successfully → Deleted
✅ Second message: Skipped (already success) → Deleted ← This was broken before!
```

## Summary

### The Fix (One Line Change)

```diff
  if (existingScreenshot?.status === 'success') {
    logger.info('Screenshot already processed, skipping');
-   return { success: true, skipped: true };
+   return; // ← Just return void!
  }
```

### Why It Matters

- ✅ Prevents infinite message processing loops
- ✅ Reduces DynamoDB read costs (no repeated queries)
- ✅ Reduces SQS costs (no repeated receives)
- ✅ Prevents log spam
- ✅ Enables proper scaling (no stuck messages)

### Lessons Learned

1. **Read the docs carefully** - `sqs-consumer` expects void return
2. **Test with real delays** - Wait for visibility timeout to verify
3. **Monitor events** - `message_processed` event confirms deletion
4. **Log clearly** - Add "(message will be deleted)" to logs for clarity

---

**Status:** ✅ Fixed (October 18, 2025)
**Impact:** Critical - Prevents message deletion failure
**Files Changed:** 1 file (`src/services/sqsConsumer.js`)
**Lines Changed:** 4 return statements
