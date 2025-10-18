#!/bin/bash

echo "=========================================="
echo "Initializing LocalStack AWS Resources"
echo "=========================================="

# Set AWS credentials for LocalStack (dummy values)
export AWS_ACCESS_KEY_ID=local_access_key_id
export AWS_SECRET_ACCESS_KEY=local_secret_access_key
export AWS_DEFAULT_REGION=us-east-1

# Set endpoint - use localstack hostname if running in Docker, localhost otherwise
if [ -n "$AWS_ENDPOINT" ]; then
  ENDPOINT_URL="$AWS_ENDPOINT"
else
  ENDPOINT_URL="http://localhost:4566"
fi

echo "Using endpoint: $ENDPOINT_URL"

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
until curl -sf "$ENDPOINT_URL/_localstack/health" > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "ERROR: LocalStack failed to start after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "Waiting for LocalStack... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done
echo "✓ LocalStack is ready!"

# Create S3 bucket
echo ""
echo "Creating S3 bucket: screenshot-bucket"
aws --endpoint-url="$ENDPOINT_URL" s3 mb s3://screenshot-bucket 2>/dev/null || echo "  → Bucket already exists"
echo "  ✓ S3 bucket ready"

# Create Dead Letter Queue first
echo ""
echo "Creating Dead Letter Queue: screenshot-queue-dlq"
DLQ_URL=$(aws --endpoint-url="$ENDPOINT_URL" sqs create-queue \
    --queue-name screenshot-queue-dlq \
    --query 'QueueUrl' --output text 2>/dev/null || \
    aws --endpoint-url="$ENDPOINT_URL" sqs get-queue-url \
    --queue-name screenshot-queue-dlq \
    --query 'QueueUrl' --output text)

# Get DLQ ARN
DLQ_ARN=$(aws --endpoint-url="$ENDPOINT_URL" sqs get-queue-attributes \
    --queue-url "$DLQ_URL" \
    --attribute-names QueueArn \
    --query 'Attributes.QueueArn' --output text)

echo "  → DLQ URL: $DLQ_URL"
echo "  → DLQ ARN: $DLQ_ARN"
echo "  ✓ Dead Letter Queue ready"

# Create SQS queue with redrive policy (retry 3 times)
echo ""
echo "Creating SQS queue: screenshot-queue (with 3 retries)"
QUEUE_URL=$(aws --endpoint-url="$ENDPOINT_URL" sqs create-queue \
    --queue-name screenshot-queue \
    --attributes "{
        \"VisibilityTimeout\": \"300\",
        \"MessageRetentionPeriod\": \"86400\",
        \"ReceiveMessageWaitTimeSeconds\": \"20\",
        \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
    }" \
    --query 'QueueUrl' --output text 2>/dev/null || \
    aws --endpoint-url="$ENDPOINT_URL" sqs get-queue-url \
    --queue-name screenshot-queue \
    --query 'QueueUrl' --output text)

echo "  → Queue URL: $QUEUE_URL"
echo "  → Max Retries: 3"
echo "  → Visibility Timeout: 300s (5 minutes)"
echo "  → Dead Letter Queue: screenshot-queue-dlq"
echo "  ✓ SQS queue ready"

# Create DynamoDB table
echo ""
echo "Creating DynamoDB table: screenshot-results"
aws --endpoint-url="$ENDPOINT_URL" dynamodb create-table \
    --table-name screenshot-results \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=status,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        "[
            {
                \"IndexName\": \"status-createdAt-index\",
                \"KeySchema\": [
                    {\"AttributeName\":\"status\",\"KeyType\":\"HASH\"},
                    {\"AttributeName\":\"createdAt\",\"KeyType\":\"RANGE\"}
                ],
                \"Projection\": {
                    \"ProjectionType\":\"ALL\"
                },
                \"ProvisionedThroughput\": {
                    \"ReadCapacityUnits\":5,
                    \"WriteCapacityUnits\":5
                }
            }
        ]" \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    2>/dev/null || echo "  → Table already exists"

echo "  ✓ DynamoDB table ready"

echo ""
echo "=========================================="
echo "✓ LocalStack initialization complete!"
echo "=========================================="
echo ""
echo "Resources created:"
echo "  - S3 Bucket: screenshot-bucket"
echo "  - SQS Queue: screenshot-queue"
echo "  - DynamoDB Table: screenshot-results"
echo "    (with StatusIndex GSI: status + createdAt)"
echo ""
