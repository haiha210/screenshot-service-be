# Screenshot Service Backend

Automated website screenshot service that receives messages from SQS, captures screenshots using Puppeteer, uploads to S3, and saves results to DynamoDB. Designed for deployment on AWS ECS.

## Features

- 📸 Automated website screenshots with Puppeteer
- 🔄 Message processing from AWS SQS
- ☁️ Image upload to AWS S3
- 💾 Results storage in AWS DynamoDB
- 🐳 Docker support for ECS deployment
- 🔧 Graceful shutdown handling
- 📊 Structured logging with Pino
- 🔄 Retry mechanism through SQS
- 🧪 LocalStack support for local development

## Project Structure

```
screenshot-service-be/
├── src/
│   ├── config/
│   │   ├── aws.js              # AWS clients configuration
│   │   └── index.js            # Application configuration
│   ├── services/
│   │   ├── screenshotService.js # Puppeteer screenshot service
│   │   ├── s3Service.js         # S3 upload service
│   │   ├── dynamodbService.js   # DynamoDB service
│   │   └── sqsConsumer.js       # SQS consumer
│   ├── utils/
│   │   └── logger.js            # Pino logger utility
│   └── index.js                 # Application entry point
├── scripts/
│   ├── send-test-message.js     # Send test SQS messages
│   ├── query-screenshots.js     # Query screenshot results
│   └── install-awslocal.sh      # Install awslocal CLI
├── localstack-init/
│   └── init-aws.sh              # LocalStack initialization script
├── logs/
│   └── .keep                    # Keep logs directory
├── Dockerfile                   # Production Docker image
├── Dockerfile.dev               # Development Docker image
├── docker-compose.yml           # Docker Compose for development
├── docker-compose.prd.yml       # Docker Compose for production
├── Makefile                     # Helper commands
├── .env.example                 # Environment variables example
└── package.json                 # Dependencies and scripts
```

## Requirements

- Node.js >= 18.0.0
- Yarn >= 1.22.0
- AWS Account with access to:
  - SQS
  - S3
  - DynamoDB
  - ECS (for deployment)
- Docker & Docker Compose (for local development)

## Technical Stack

- **Logger**: Pino for high-performance structured logging
- **Browser Automation**: Puppeteer v24+ with headless Chromium
- **AWS SDK**: AWS SDK v3 (modular)
- **Message Queue**: sqs-consumer v10+
- **Container**: Docker with Alpine Linux
- **Local Testing**: LocalStack for AWS services emulation

## Installation

### 1. Clone repository

```bash
git clone <repository-url>
cd screenshot-service-be
```

### 2. Install dependencies

```bash
yarn install
```

### 3. Environment configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your AWS credentials and configuration:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key

# SQS Configuration
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/screenshot-queue

# S3 Configuration
S3_BUCKET_NAME=your-screenshot-bucket

# DynamoDB Configuration
DYNAMODB_TABLE_NAME=screenshot-results

# Screenshot Configuration
SCREENSHOT_WIDTH=1920
SCREENSHOT_HEIGHT=1080
SCREENSHOT_FORMAT=png

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
```

## AWS Resources Setup

### 1. SQS Queue

Create SQS queue with appropriate configuration:

```bash
aws sqs create-queue --queue-name screenshot-queue \
  --attributes VisibilityTimeout=300,MessageRetentionPeriod=86400
```

### 2. S3 Bucket

Create S3 bucket for storing screenshots:

```bash
aws s3 mb s3://your-screenshot-bucket
```

### 3. DynamoDB Table

Create DynamoDB table:

```bash
aws dynamodb create-table \
  --table-name screenshot-results \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "status-createdAt-index",
        "KeySchema": [
          {"AttributeName": "status", "KeyType": "HASH"},
          {"AttributeName": "createdAt", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 5,
          "WriteCapacityUnits": 5
        }
      }
    ]' \
  --provisioned-throughput \
    ReadCapacityUnits=5,WriteCapacityUnits=5
```

## Running the Application

### Local Development (without Docker)

```bash
yarn dev
```

### Production

```bash
yarn start
```

### Local Development with Docker Compose + LocalStack

Start all services including LocalStack:

```bash
docker-compose up
```

Or use Makefile:

```bash
make dev
```

## Message Format

Send messages to the SQS queue with the following format:

```json
{
  "url": "https://example.com",
  "width": 1920,
  "height": 1080,
  "format": "png",
  "quality": 80,
  "fullPage": false,
  "requestId": "optional-custom-id"
}
```

### Parameters:

- `url` (required): Website URL to screenshot
- `width` (optional): Viewport width (default: 1920)
- `height` (optional): Viewport height (default: 1080)
- `format` (optional): Image format - "png" or "jpeg" (default: "png")
- `quality` (optional): Image quality for JPEG (1-100, default: 80)
- `fullPage` (optional): Capture full page (default: false)
- `requestId` (optional): Custom request ID (auto-generated UUID if not provided)

### Example - Send message via AWS CLI:

```bash
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/screenshot-queue \
  --message-body '{
    "url": "https://github.com",
    "width": 1920,
    "height": 1080,
    "format": "png",
    "fullPage": false
  }'
```

### Example - Send test message with helper script:

```bash
# Send test message to LocalStack
node scripts/send-test-message.js https://google.com

# Or use yarn script
yarn send-message https://google.com
```

The script will:

- Generate a unique `requestId`
- Send the message to SQS
- Save message info to `logs/sent-messages.json` for tracking

## Docker

### Build image:

```bash
docker build -t screenshot-service .
```

### Run container:

```bash
docker run -d \
  --name screenshot-service \
  --env-file .env \
  screenshot-service
```

## Docker Compose

### Production mode:

```bash
# Start service
docker-compose -f docker-compose.prd.yml up -d

# View logs
docker-compose -f docker-compose.prd.yml logs -f

# Stop service
docker-compose -f docker-compose.prd.yml down
```

### Development mode with LocalStack:

For local testing with AWS services emulation:

```bash
# Start services (including LocalStack)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

LocalStack will automatically initialize:

- SQS queue: `screenshot-queue`
- S3 bucket: `screenshot-bucket`
- DynamoDB table: `screenshot-results` with GSI

### Send test message to LocalStack:

Using the helper script:

```bash
node scripts/send-test-message.js https://example.com
```

Using awslocal CLI (after installation):

```bash
source venv/bin/activate
awslocal sqs send-message \
  --queue-url http://localhost:4566/000000000000/screenshot-queue \
  --message-body '{"url":"https://example.com","width":1920,"height":1080}'
```

### Check LocalStack resources:

```bash
source venv/bin/activate

# List S3 buckets and objects
awslocal s3 ls
awslocal s3 ls s3://screenshot-bucket --recursive

# List SQS queues
awslocal sqs list-queues

# Scan DynamoDB table
awslocal dynamodb scan --table-name screenshot-results

# Query screenshots by status
yarn query-screenshots success

# Get specific screenshot by requestId
yarn get-screenshot <requestId>
```

### Query Specific Screenshot:

```bash
# Get screenshot details by requestId
yarn get-screenshot 4f6f6899-7da4-4c33-87a1-4a3b0a484b9c

# Or use the script directly
node scripts/get-screenshot.js <requestId>
```

### Download screenshot from LocalStack:

```bash
source venv/bin/activate
awslocal s3 cp s3://screenshot-bucket/screenshots/2025/01/18/filename.png ./downloaded.png
```

## awslocal CLI Installation

To easily interact with LocalStack, install `awslocal` CLI wrapper:

```bash
# Install in project virtual environment
./scripts/install-awslocal.sh

# Activate virtual environment
source venv/bin/activate

# Use awslocal commands
awslocal s3 ls
awslocal sqs list-queues
awslocal dynamodb list-tables

# Deactivate when done
deactivate
```

## 📊 Logging

Service uses [Pino](https://getpino.io/) for high-performance structured logging.

### Log Levels

Set log level via environment variable:

```bash
LOG_LEVEL=debug yarn start
```

Available levels: `trace`, `debug`, `info` (default), `warn`, `error`, `fatal`

### Log Format

- **Development**: Pretty-printed, colorized logs
- **Production**: JSON format for easy parsing and querying

### Learn more

Detailed logging practices: [LOGGING.md](./LOGGING.md)

## 🚀 Scaling

Service is designed to scale horizontally with multiple ECS containers.

### Key Features

- ✅ Race condition prevention with DynamoDB conditional writes
- ✅ Duplicate screenshot detection
- ✅ SQS visibility timeout to prevent message conflicts
- ✅ Safe concurrent processing

### Learn more

Detailed scaling guide: [docs/SCALING.md](./docs/SCALING.md)

## Makefile Commands

Project includes a Makefile for easier management:

```bash
# View all available commands
make help

# Development with LocalStack
make dev              # Start development services
make logs             # View logs
make down             # Stop services

# Testing
make query-screenshots STATUS=success       # Query screenshots by status

# LocalStack utilities
make check-queue      # Check SQS queue
make check-s3         # Check S3 bucket
make check-dynamodb   # Check DynamoDB table

# Yarn scripts
yarn send-message                           # Send test message
yarn query-screenshots                      # Query screenshots
```

## Deploy to AWS ECS

### 1. Push image to ECR:

```bash
# Create ECR repository
aws ecr create-repository --repository-name screenshot-service

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Tag and push image
docker tag screenshot-service:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/screenshot-service:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/screenshot-service:latest
```

### 2. Create ECS Task Definition:

Create `task-definition.json`:

```json
{
  "family": "screenshot-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<account-id>:role/screenshotServiceTaskRole",
  "containerDefinitions": [
    {
      "name": "screenshot-service",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/screenshot-service:latest",
      "essential": true,
      "environment": [
        { "name": "AWS_REGION", "value": "us-east-1" },
        { "name": "SQS_QUEUE_URL", "value": "your-queue-url" },
        { "name": "S3_BUCKET_NAME", "value": "your-bucket-name" },
        { "name": "DYNAMODB_TABLE_NAME", "value": "screenshot-results" },
        { "name": "NODE_ENV", "value": "production" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/screenshot-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 3. Register task definition:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### 4. Create ECS Service:

```bash
aws ecs create-service \
  --cluster your-cluster-name \
  --service-name screenshot-service \
  --task-definition screenshot-service \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

## IAM Permissions

Service requires the following permissions:

### Task Role Permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:*:*:screenshot-queue"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::your-screenshot-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/screenshot-results",
        "arn:aws:dynamodb:*:*:table/screenshot-results/index/*"
      ]
    }
  ]
}
```

## DynamoDB Schema

### Main Table:

```
Primary Key: id (String) - Screenshot ID
```

### Attributes:

- `id`: String - Unique screenshot ID (or requestId)
- `url`: String - URL that was captured
- `s3Url`: String - S3 URL of the screenshot
- `s3Key`: String - S3 object key
- `status`: String - "processing" | "success" | "failed"
- `width`: Number - Viewport width
- `height`: Number - Viewport height
- `format`: String - Image format
- `errorMessage`: String - Error message (if failed)
- `createdAt`: String - ISO timestamp
- `updatedAt`: String - ISO timestamp

### Global Secondary Index:

- Index Name: `status-createdAt-index`
- Partition Key: `status`
- Sort Key: `createdAt`

Query examples:

```bash
# Query all successful screenshots
yarn query-screenshots success

# Query all failed screenshots
yarn query-screenshots failed
```

## Monitoring

### CloudWatch Logs

Service automatically writes logs to CloudWatch when running on ECS.

### Metrics to Monitor

- SQS queue depth
- Message processing time
- Failed screenshots
- S3 upload success rate
- DynamoDB write/read capacity

## Troubleshooting

### Puppeteer doesn't run in Docker

Ensure all dependencies are installed in the Dockerfile. Current image includes all necessary dependencies.

### Memory issues

Increase memory allocation in ECS task definition if processing large screenshots.

### SQS message timeout

Increase visibility timeout if screenshot capture takes longer than expected.

### LocalStack connection refused

Make sure LocalStack is running and healthy:

```bash
docker-compose ps
docker-compose logs localstack
```

### Permission denied when writing to logs/

```bash
chmod 755 logs/
# or
sudo chown -R $USER:$USER logs/
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.
