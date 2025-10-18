# Query Scripts Guide

## Overview

Collection of scripts to query and inspect screenshot data from DynamoDB.

---

## 1. Get Screenshot by RequestId

### Script: `get-screenshot.js`

Get detailed information about a specific screenshot using its requestId (UUID).

### Usage

```bash
# Using yarn
yarn get-screenshot <requestId>

# Or directly
node scripts/get-screenshot.js <requestId>
```

### Examples

```bash
# Get screenshot by requestId
yarn get-screenshot 4f6f6899-7da4-4c33-87a1-4a3b0a484b9c

# From sent-messages.json
cat logs/sent-messages.json | jq -r '.[-1].requestId' | xargs yarn get-screenshot
```

### Output Example

```
🔍 Looking up screenshot with requestId: 4f6f6899-7da4-4c33-87a1-4a3b0a484b9c
-------------------------------------------

✅ Screenshot found!

Screenshot Details:
==========================================
ID:              4f6f6899-7da4-4c33-87a1-4a3b0a484b9c
URL:             https://example.com
Status:          success
Format:          png
Width:           1920px
Height:          1080px
Created At:      2025-10-18T10:15:30.123Z
Updated At:      2025-10-18T10:15:45.456Z

S3 Information:
------------------------------------------
S3 URL:          https://screenshot-bucket.s3.amazonaws.com/screenshots/...
S3 Key:          screenshots/2025/10/18/4f6f6899-7da4-4c33-87a1-4a3b0a484b9c.png

Status Summary:
==========================================
✅ Screenshot captured successfully
📸 Download: https://screenshot-bucket.s3.amazonaws.com/screenshots/...
```

### Status Types

**✅ Success:**

```
Status:          success
✅ Screenshot captured successfully
📸 Download: <s3-url>
```

**⏳ Processing:**

```
Status:          processing
⏳ Screenshot is being processed...
⏱️  Processing duration: 2 minutes
```

**❌ Failed:**

```
Status:          failed
❌ Screenshot processing failed
💬 Reason: Navigation timeout exceeded
```

---

## 2. Query Screenshots by Status

### Script: `query-screenshots.js`

Query multiple screenshots by their status (success, failed, processing).

### Usage

```bash
# Using yarn
yarn query-screenshots [status]

# Or directly
node scripts/query-screenshots.js [status]
```

### Examples

```bash
# Query successful screenshots (default)
yarn query-screenshots
yarn query-screenshots success

# Query failed screenshots
yarn query-screenshots failed

# Query screenshots being processed
yarn query-screenshots processing
```

### Output Example

```
Querying screenshots with status: success
-------------------------------------------

Found 3 screenshot(s):

1. Screenshot ID: 4f6f6899-7da4-4c33-87a1-4a3b0a484b9c
   URL: https://example.com
   Status: success
   S3 URL: https://screenshot-bucket.s3.amazonaws.com/screenshots/...
   Created: 2025-10-18T10:15:30.123Z

2. Screenshot ID: 81bb7a9f-618e-47b5-bad1-779578beef24
   URL: https://google.com
   Status: success
   S3 URL: https://screenshot-bucket.s3.amazonaws.com/screenshots/...
   Created: 2025-10-18T10:20:15.789Z

3. Screenshot ID: a1b2c3d4-e5f6-4789-abcd-ef1234567890
   URL: https://github.com
   Status: success
   S3 URL: https://screenshot-bucket.s3.amazonaws.com/screenshots/...
   Created: 2025-10-18T10:25:42.456Z
```

---

## 3. Send Test Message

### Script: `send-test-message.js`

Send a test message to SQS queue and save the requestId for later lookup.

### Usage

```bash
# Using yarn
yarn send-message [url]

# Or directly
node scripts/send-test-message.js [url]
```

### Examples

```bash
# Send message with default URL
yarn send-message

# Send message with custom URL
yarn send-message https://example.com

# Send message without protocol (auto-adds https://)
yarn send-message example.com
```

### Output

```
==========================================
Sending Test Message to SQS
==========================================
URL: https://example.com
Queue URL: http://localstack:4566/000000000000/screenshot-queue
Region: us-east-1

Message sent successfully!
------------------------------------------
Message ID: 61074bcd-07e2-463e-a032-6e8ec916a890
Request ID: 4f6f6899-7da4-4c33-87a1-4a3b0a484b9c  ← Use this to lookup screenshot

Message details saved to: logs/sent-messages.json

✅ Test message sent successfully!

Next steps:
  1. Monitor logs: docker compose logs -f app
  2. Check status: yarn get-screenshot 4f6f6899-7da4-4c33-87a1-4a3b0a484b9c
  3. View results: yarn query-screenshots success
```

---

## Common Workflows

### Workflow 1: Send and Track Message

```bash
# Step 1: Send test message
yarn send-message https://example.com
# Note the requestId from output

# Step 2: Monitor processing
docker compose logs -f app

# Step 3: Check status after ~30 seconds
yarn get-screenshot <requestId>

# Step 4: Download screenshot if successful
# Copy S3 URL from output and download
```

### Workflow 2: Investigate Failed Screenshots

```bash
# Step 1: Query all failed screenshots
yarn query-screenshots failed

# Step 2: Get details for specific failure
yarn get-screenshot <requestId-from-step-1>

# Step 3: Check logs for that requestId
docker compose logs app | grep <requestId>
```

### Workflow 3: Monitor Queue Processing

```bash
# Step 1: Check processing screenshots
yarn query-screenshots processing

# Step 2: If any stuck (> 10 min), get details
yarn get-screenshot <requestId>

# Step 3: Check if container is running
docker compose ps

# Step 4: Check container logs
docker compose logs app --tail=100
```

### Workflow 4: Bulk Testing

```bash
# Step 1: Send multiple messages
yarn load-test 10

# Step 2: Wait for processing
sleep 30

# Step 3: Check success rate
yarn query-screenshots success | grep "Found"
yarn query-screenshots failed | grep "Found"

# Step 4: Investigate failures
yarn query-screenshots failed
```

---

## Advanced Queries

### Get Latest Screenshot

```bash
# Using jq to parse sent-messages.json
cat logs/sent-messages.json | jq -r '.[-1].requestId' | xargs yarn get-screenshot
```

### Get All RequestIds from Logs

```bash
# Extract all requestIds from sent-messages.json
cat logs/sent-messages.json | jq -r '.[].requestId'
```

### Check Multiple Screenshots

```bash
# Loop through recent screenshots
cat logs/sent-messages.json | jq -r '.[-5:][].requestId' | while read id; do
  echo "Checking $id..."
  yarn get-screenshot "$id"
  echo "---"
done
```

### Count Screenshots by Status

```bash
# Success count
yarn query-screenshots success 2>/dev/null | grep "Found" | grep -oE '[0-9]+' | head -1

# Failed count
yarn query-screenshots failed 2>/dev/null | grep "Found" | grep -oE '[0-9]+' | head -1

# Processing count
yarn query-screenshots processing 2>/dev/null | grep "Found" | grep -oE '[0-9]+' | head -1
```

---

## Using with Docker

### Inside Container

```bash
# Execute scripts inside running container
docker compose exec app yarn get-screenshot <requestId>
docker compose exec app yarn query-screenshots success
```

### From Host Machine

```bash
# Scripts work from host if .env is configured correctly
yarn get-screenshot <requestId>
yarn query-screenshots success
```

---

## Troubleshooting

### Script Not Found Error

```bash
Error: Cannot find module '../src/services/dynamodbService'
```

**Solution:**

```bash
# Make sure you're in project root
cd /home/gm/projects/nodejs/screenshot-service-be

# Install dependencies if needed
yarn install
```

### Connection Refused

```bash
Error: connect ECONNREFUSED 127.0.0.1:4566
```

**Solution:**

```bash
# Check if LocalStack is running
docker compose ps

# Start services if not running
docker compose up -d

# Check .env has correct endpoint
cat .env | grep AWS_ENDPOINT
```

### Screenshot Not Found

```
❌ Screenshot not found with this requestId.
```

**Possible causes:**

1. Wrong requestId (typo or wrong UUID)
2. Message not yet processed
3. Message failed and was moved to DLQ
4. Using different environment (LocalStack vs AWS)

**Solutions:**

```bash
# Check sent-messages.json for correct requestId
cat logs/sent-messages.json | jq -r '.[-1]'

# Check queue for pending messages
docker compose exec app node -e "
  const AWS = require('@aws-sdk/client-sqs');
  const sqs = new AWS.SQS({ endpoint: 'http://localstack:4566', region: 'us-east-1' });
  sqs.getQueueAttributes({
    QueueUrl: 'http://localstack:4566/000000000000/screenshot-queue',
    AttributeNames: ['All']
  }).then(console.log);
"

# Check if message is processing
yarn query-screenshots processing
```

---

## Environment Variables

Scripts use these environment variables from `.env`:

```bash
# Required
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=screenshot-results

# For LocalStack
AWS_ENDPOINT=http://localstack:4566
USE_LOCALSTACK=true

# For AWS
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
```

---

## Script Files

| Script                 | Purpose                            | Input                              | Output                   |
| ---------------------- | ---------------------------------- | ---------------------------------- | ------------------------ |
| `get-screenshot.js`    | Get single screenshot by requestId | requestId (UUID)                   | Detailed screenshot info |
| `query-screenshots.js` | Query multiple by status           | status (success/failed/processing) | List of screenshots      |
| `send-test-message.js` | Send test SQS message              | url (optional)                     | requestId for tracking   |
| `load-test.js`         | Send multiple messages             | count, url (optional)              | Performance metrics      |

---

## Tips

1. **Always save requestId** from `send-test-message.js` output
2. **Use `logs/sent-messages.json`** to track all sent messages
3. **Query by status** to monitor success rate
4. **Check processing** if messages seem stuck
5. **Use jq** for parsing JSON output efficiently

---

## Summary

✅ **get-screenshot.js**: Get detailed info for one screenshot by requestId
✅ **query-screenshots.js**: List multiple screenshots by status
✅ **send-test-message.js**: Send test message and get requestId
✅ **load-test.js**: Test with multiple concurrent messages

**Common pattern:**

```bash
# Send → Track → Verify
yarn send-message example.com  # Get requestId
yarn get-screenshot <requestId>  # Check status
yarn query-screenshots success   # Verify success
```

🚀 **Ready to track and debug screenshots efficiently!**
