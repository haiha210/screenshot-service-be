# Race Condition Prevention Flow

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          SQS Queue                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Message 1│  │ Message 2│  │ Message 3│  │ Message 4│ ...    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└────────┬───────────────┬───────────────┬───────────┬────────────┘
         │               │               │           │
         │ Visibility    │ Visibility    │           │
         │ Timeout       │ Timeout       │           │
         ▼               ▼               ▼           ▼
    ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
    │Container│     │Container│     │Container│     │Container│
    │   #1    │     │   #2    │     │   #3    │     │   #4    │
    │ ECS Task│     │ ECS Task│     │ ECS Task│     │ ECS Task│
    └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │               │
         └───────┬───────┴───────┬───────┴───────┬───────┘
                 │               │               │
                 ▼               ▼               ▼
         ┌──────────────────────────────────────────┐
         │         DynamoDB Table                   │
         │  ┌────────────────────────────────────┐  │
         │  │  Conditional Write Protection       │  │
         │  │  (attribute_not_exists(id))        │  │
         │  └────────────────────────────────────┘  │
         │                                           │
         │  Ensures only ONE container can create   │
         │  record for each unique screenshotId    │
         └──────────────────┬───────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   S3 Bucket   │
                    │  screenshots/ │
                    └───────────────┘
```

## Sequence Diagram: Normal Flow (No Conflict)

```
Container A                DynamoDB              SQS
    │                         │                   │
    │◄────Receive Message─────│                   │
    │                         │                   │
    │──Get Screenshot(id)────►│                   │
    │◄────Not Found──────────│                   │
    │                         │                   │
    │──Put (if not exists)───►│                   │
    │◄────✅ SUCCESS─────────│                   │
    │                         │                   │
    │──Process Screenshot────►│                   │
    │                         │                   │
    │──Update (success)──────►│                   │
    │◄────✅ SUCCESS─────────│                   │
    │                         │                   │
    │──────────────────────────────Delete Message►│
    │◄───────────────────────────────────────────│
```

## Sequence Diagram: Race Condition (Protected)

```
Container A        Container B        DynamoDB              SQS
    │                  │                  │                   │
    │◄─Receive────────│◄─Receive─────────│                   │
    │  Message        │  Message         │                   │
    │  (same ID)      │  (duplicate)     │                   │
    │                  │                  │                   │
    │──Get(id)────────────────────────────►                   │
    │                  │──Get(id)────────►                   │
    │◄─Not Found──────────────────────────│                   │
    │                  │◄─Not Found──────│                   │
    │                  │                  │                   │
    │  Both checked at the same time     │                   │
    │  Both see "not exists"             │                   │
    │                  │                  │                   │
    │──Put (if not exists)────────────────►                   │
    │◄────✅ SUCCESS─────────────────────│  (Container A wins)│
    │                  │                  │                   │
    │                  │──Put (if not exists)►                │
    │                  │◄────❌ FAIL────│  (Already exists)  │
    │                  │  ConditionalCheckFailedException     │
    │                  │                  │                   │
    │──Process────────►│                  │                   │
    │                  │──Skip & Return───►                   │
    │                  │   success=true   │                   │
    │                  │                  │                   │
    │──Update(success)►│                  │                   │
    │◄────✅ ─────────│                  │                   │
    │                  │                  │                   │
    │──────────────────────────────────────Delete Message────►│
    │                  │──────────────────────Delete Message►│
    │◄───────────────────────────────────────────────────────│
    │                  │◄───────────────────────────────────│
```

## State Machine

```
                    ┌─────────────┐
                    │   Message   │
                    │   Received  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
              ┌─────│Check Status │─────┐
              │     │ in DynamoDB │     │
              │     └─────────────┘     │
              │                         │
    ┌─────────▼──────────┐    ┌────────▼────────┐
    │  Status='success'  │    │ Status='process'│
    │  (Already done)    │    │ (In progress)   │
    └─────────┬──────────┘    └────────┬────────┘
              │                         │
              │    ┌────────────────────┘
              │    │
              │    │         ┌──────────────┐
              │    │         │Not Exists    │
              │    │         │(New)         │
              │    │         └──────┬───────┘
              │    │                │
              │    │                ▼
              │    │         ┌──────────────────┐
              │    │         │ Conditional Write│
              │    │         │ (if not exists)  │
              │    │         └────┬─────────┬───┘
              │    │              │         │
              │    │         ┌────▼──┐  ┌───▼────┐
              │    │         │SUCCESS│  │  FAIL  │
              │    │         └───┬───┘  │ (Race) │
              │    │             │      └───┬────┘
              │    │             │          │
              │    │             ▼          │
              │    │      ┌─────────────┐  │
              │    │      │  Process    │  │
              │    │      │ Screenshot  │  │
              │    │      └──────┬──────┘  │
              │    │             │          │
              │    │             ▼          │
              │    │      ┌─────────────┐  │
              │    │      │Update Status│  │
              │    │      │'success'    │  │
              │    │      └──────┬──────┘  │
              │    │             │          │
              ▼    ▼             ▼          ▼
         ┌────────────────────────────────────┐
         │    Return Success (skip=true)      │
         │    → Message Deleted from SQS      │
         └────────────────────────────────────┘
```

## Key Points

### 1. DynamoDB Conditional Write

```javascript
// This is the critical line that prevents race condition
commandParams.ConditionExpression = 'attribute_not_exists(id)';
```

**How it works**:

- DynamoDB atomically checks if item exists
- If not exists → writes item and returns success
- If exists → rejects write and throws ConditionalCheckFailedException
- This happens in a single atomic operation

### 2. Three Skip Scenarios

#### Scenario A: Already Success

```javascript
if (existingScreenshot?.status === 'success') {
  return { success: true, skipped: true };
}
```

**When**: Screenshot was already processed before
**Action**: Skip entirely, return existing S3 URL

#### Scenario B: Currently Processing

```javascript
if (existingScreenshot?.status === 'processing') {
  return { success: true, skipped: true, reason: 'already_processing' };
}
```

**When**: Another container is currently processing
**Action**: Skip to avoid duplicate work

#### Scenario C: Race Condition Caught

```javascript
catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    return { success: true, skipped: true, reason: 'race_condition_prevented' };
  }
}
```

**When**: Two containers tried to create at same time
**Action**: One wins, one gets rejected, both return success

### 3. Why All Return Success?

All 3 scenarios return `{ success: true }` because:

1. **Idempotency**: The end result is the same - screenshot exists
2. **Message Deletion**: We want SQS to delete the message (no retry needed)
3. **No Error State**: Not processing a duplicate is not an error
4. **Cost Efficiency**: Don't waste time retrying something already done

## Scaling Behavior

### 1 Container

```
SQS → Container 1 → Process all messages sequentially
```

### 2 Containers (No conflicts)

```
SQS → Container 1 → Messages 1, 3, 5, 7...
    → Container 2 → Messages 2, 4, 6, 8...
```

### 2 Containers (With duplicate messages)

```
SQS → Container 1 → Process Message A ✅
    → Container 2 → Tries Message A → Skips (race protected) ⚠️
```

### 5 Containers (High load)

```
SQS Queue: 1000 messages
    │
    ├─► Container 1: 200 messages
    ├─► Container 2: 200 messages
    ├─► Container 3: 200 messages
    ├─► Container 4: 200 messages
    └─► Container 5: 200 messages

Auto-distributed by SQS visibility timeout
No race conditions due to conditional writes
```

## Performance Impact

### Without Conditional Write (❌ Bad)

```
Time ────────────────────────►
Container A: ████████████ (Full processing)
Container B: ████████████ (Duplicate work - WASTED)
Result: 2x cost, 2x screenshots (duplicate)
```

### With Conditional Write (✅ Good)

```
Time ────────────────────────►
Container A: ████████████ (Full processing)
Container B: ██ (Quick check, skip)
Result: 1x cost, 1x screenshot (correct)
```

## Conclusion

✅ **Safe to scale ECS containers**
✅ **No duplicate screenshots**
✅ **Efficient resource usage**
✅ **Automatic race condition prevention**
✅ **Idempotent message processing**
