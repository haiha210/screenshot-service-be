# SQS Batch Size Configuration

## Overview

`SQS_BATCH_SIZE` controls how many messages each container processes concurrently. Higher batch size = higher throughput but more memory usage.

---

## Current Configuration

### Default: 5 messages per container

**Files Updated:**

- `docker-compose.yml`: `SQS_BATCH_SIZE=5`
- `.env.example`: `SQS_BATCH_SIZE=5`
- `docs/SCALING.md`: Updated recommendations

---

## How Batch Size Works

### Batch Size = 1 (Serial Processing)

```
Container receives 1 message → Process → Complete → Get next message
```

**Pros:**

- ✅ Lower memory usage
- ✅ Predictable resource consumption
- ✅ Easier to debug

**Cons:**

- ❌ Lower throughput
- ❌ Slower queue processing

### Batch Size = 5 (Concurrent Processing)

```
Container receives up to 5 messages simultaneously
├─ Process message 1
├─ Process message 2
├─ Process message 3
├─ Process message 4
└─ Process message 5
```

**Pros:**

- ✅ 5x potential throughput
- ✅ Better resource utilization
- ✅ Faster queue draining

**Cons:**

- ⚠️ Higher memory usage (5 browser instances)
- ⚠️ Need more CPU
- ⚠️ More complex error handling

---

## Memory Calculation

### Per Screenshot Processing:

- Chromium browser: ~200-500 MB
- Screenshot buffer: ~5-20 MB
- Node.js overhead: ~50 MB
- **Total per message**: ~300-600 MB

### With Batch Size = 5:

- 5 × 300 MB (minimum) = **1.5 GB**
- 5 × 600 MB (maximum) = **3.0 GB**
- **Recommended container memory**: 4 GB (safe margin)

### Container Sizing:

```
Batch Size 1  → 1 GB memory  → 512 CPU
Batch Size 5  → 4 GB memory  → 1024 CPU
Batch Size 10 → 8 GB memory  → 2048 CPU
```

---

## Performance Comparison

### Throughput Test (100 messages)

**Batch Size = 1:**

```
1 container  × 1 msg  × 20 msg/min = 20 msg/min
5 containers × 1 msg  × 20 msg/min = 100 msg/min
Time to process 100 messages: 5 minutes
```

**Batch Size = 5:**

```
1 container  × 5 msgs × 20 msg/min = 100 msg/min
5 containers × 5 msgs × 20 msg/min = 500 msg/min
Time to process 100 messages: 1 minute
```

**Improvement: 5x faster! 🚀**

---

## Choosing the Right Batch Size

### Consider:

1. **Average Processing Time**
   - Fast (< 10s): Can use higher batch size (10)
   - Medium (10-30s): Use moderate batch size (5)
   - Slow (> 30s): Use lower batch size (3)

2. **Memory Availability**
   - 2 GB container: Batch size 1-3
   - 4 GB container: Batch size 5
   - 8 GB container: Batch size 10

3. **Queue Depth**
   - Always empty: Lower batch size OK
   - Occasionally spikes: Moderate batch size (5)
   - Always full: Higher batch size (10)

4. **Error Rate**
   - High error rate: Lower batch size (easier retry)
   - Low error rate: Higher batch size (maximize throughput)

---

## Configuration Examples

### Development (LocalStack)

```yaml
# docker-compose.yml
environment:
  - SQS_BATCH_SIZE=5 # Test concurrent processing
  - LOG_LEVEL=debug
```

### Production - Light Load

```json
// ECS Task Definition
{
  "environment": [
    { "name": "SQS_BATCH_SIZE", "value": "3" },
    { "name": "LOG_LEVEL", "value": "info" }
  ],
  "cpu": "512",
  "memory": "2048"
}
```

### Production - Heavy Load

```json
// ECS Task Definition
{
  "environment": [
    { "name": "SQS_BATCH_SIZE", "value": "10" },
    { "name": "LOG_LEVEL", "value": "info" }
  ],
  "cpu": "2048",
  "memory": "8192"
}
```

---

## Monitoring

### CloudWatch Metrics to Watch

**SQS:**

- `ApproximateNumberOfMessagesVisible` - Should decrease faster with higher batch size
- `NumberOfMessagesDeleted` - Should increase with higher batch size

**ECS:**

- `CPUUtilization` - Should be 40-80% (not maxed out)
- `MemoryUtilization` - Should be < 80%

**Application Logs:**

```json
{
  "msg": "Processing screenshot message",
  "batchSize": 5,
  "currentBatch": 3, // 3 messages currently processing
  "messageId": "..."
}
```

### Warning Signs

🚨 **Memory Issues:**

```
MemoryUtilization > 90%
Container OOM kills
```

**Solution**: Reduce batch size or increase memory

🚨 **CPU Bottleneck:**

```
CPUUtilization > 95%
Processing time increasing
```

**Solution**: Reduce batch size or increase CPU

🚨 **Timeout Errors:**

```
Visibility timeout expiring
Messages returning to queue
```

**Solution**: Increase visibility timeout or reduce batch size

---

## Testing Batch Processing

### Test Different Batch Sizes

```bash
# Test with batch size 1
docker compose down
# Edit docker-compose.yml: SQS_BATCH_SIZE=1
docker compose up -d
yarn load-test 20

# Test with batch size 5
docker compose down
# Edit docker-compose.yml: SQS_BATCH_SIZE=5
docker compose up -d
yarn load-test 20

# Test with batch size 10
docker compose down
# Edit docker-compose.yml: SQS_BATCH_SIZE=10
docker compose up -d
yarn load-test 20
```

### Compare Results

```bash
# Monitor processing time
docker compose logs app | grep "Screenshot processed successfully"

# Check memory usage
docker stats screenshot-service-dev

# Check queue depth
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/screenshot-queue \
  --attribute-names ApproximateNumberOfMessagesVisible
```

---

## Auto-Scaling with Batch Size

### Scaling Strategy

**Target**: Process all messages within 5 minutes

**Formula:**

```
Required containers = Queue depth / (Batch size × Processing rate)

Example:
Queue depth: 1000 messages
Batch size: 5
Processing rate: 10 messages/minute per container

Required containers = 1000 / (5 × 10) = 20 containers
```

### CloudWatch Alarm

```yaml
AlarmName: HighQueueDepth
MetricName: ApproximateNumberOfMessagesVisible
Threshold: 100 # Scale up if > 100 messages waiting
ComparisonOperator: GreaterThanThreshold
EvaluationPeriods: 2
Period: 60
```

---

## Best Practices

### ✅ Do:

1. **Start conservative**: Begin with batch size 3-5
2. **Monitor first**: Watch memory and CPU before increasing
3. **Load test**: Test with production-like traffic
4. **Set memory limits**: Prevent OOM with proper limits
5. **Use auto-scaling**: Let AWS handle container scaling

### ❌ Don't:

1. **Don't max out**: Leave 20% headroom for spikes
2. **Don't ignore errors**: High batch size can hide retry issues
3. **Don't forget visibility timeout**: Must be > batch processing time
4. **Don't skip testing**: Always test batch size changes
5. **Don't use same size everywhere**: Different environments need different settings

---

## Troubleshooting

### Issue: Container keeps restarting

**Cause**: Out of memory with high batch size

**Solution:**

```bash
# Check memory usage
docker stats

# Reduce batch size
SQS_BATCH_SIZE=3

# Or increase container memory
memory: "4096"  # 4 GB
```

### Issue: Messages timing out

**Cause**: Visibility timeout < batch processing time

**Solution:**

```bash
# Calculate required timeout
Batch size: 5
Processing time per message: 30s
Total time: 5 × 30s = 150s
Visibility timeout: 150s × 2 = 300s (5 min) ✅

# Update queue
aws sqs set-queue-attributes \
  --queue-url $QUEUE_URL \
  --attributes VisibilityTimeout=300
```

### Issue: Low throughput despite high batch size

**Cause**: CPU bottleneck or slow target websites

**Check:**

```bash
# CPU usage
docker stats | grep CPU

# Processing times
docker compose logs app | grep duration

# If CPU > 90%: Reduce batch size or add more CPU
# If websites slow: Increase timeout, can't fix with batch size
```

---

## Summary

✅ **Current Setting: `SQS_BATCH_SIZE=5`**

**Benefits:**

- 5x throughput compared to batch size 1
- Good balance between performance and resource usage
- Works well with 4GB memory containers
- Suitable for most workloads

**Requirements:**

- Container: 4GB memory, 1024 CPU
- Visibility timeout: 300s (5 minutes)
- Monitor memory and CPU usage

**When to Adjust:**

- Increase to 10: If consistently high queue depth and have 8GB+ memory
- Decrease to 3: If memory issues or high error rate
- Decrease to 1: For debugging or testing

🚀 **Ready for production with proper monitoring!**
