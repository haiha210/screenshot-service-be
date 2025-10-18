#!/bin/bash

echo "=========================================="
echo "Initializing LocalStack AWS Resources"
echo "=========================================="

# Set AWS credentials for LocalStack (dummy values)
export AWS_ACCESS_KEY_ID=local_access_key_id
export AWS_SECRET_ACCESS_KEY=local_secret_access_key
export AWS_DEFAULT_REGION=us-east-1

# Set endpoint
ENDPOINT_URL="http://localhost:4566"

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
aws --endpoint-url="$ENDPOINT_URL" s3 ls

# Create SQS queue
echo ""
echo "Creating SQS queue: screenshot-queue"
QUEUE_URL=$(aws --endpoint-url="$ENDPOINT_URL" sqs create-queue --queue-name screenshot-queue --query 'QueueUrl' --output text 2>/dev/null || aws --endpoint-url="$ENDPOINT_URL" sqs get-queue-url --queue-name screenshot-queue --query 'QueueUrl' --output text)
echo "  → Queue URL: $QUEUE_URL"
aws --endpoint-url="$ENDPOINT_URL" sqs list-queues

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

aws --endpoint-url="$ENDPOINT_URL" dynamodb list-tables

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
