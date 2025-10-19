#!/bin/bash

# Package artifacts for deployment
# Usage: ./package-artifacts.sh

set -e

echo "================================================"
echo "Packaging Screenshot Service Artifacts"
echo "================================================"
echo ""

# Change to project root
cd "$(dirname "$0")"

# Create artifacts directory
mkdir -p dist/artifacts

# Package Lambda functions
echo "📦 Packaging Lambda functions..."
cd lambda
./build.sh
cd ..

# Copy Lambda zips to artifacts
mkdir -p dist/artifacts/lambda
cp dist/*.zip dist/artifacts/lambda/

echo "✅ Lambda functions packaged"
echo ""

# Package Swagger specification
echo "📦 Packaging Swagger specification..."
mkdir -p dist/artifacts/swagger
cp swagger/api-spec.yaml dist/artifacts/swagger/

echo "✅ Swagger specification packaged"
echo ""

# Create ECS task definition (placeholder)
echo "📦 Creating ECS task definition..."
mkdir -p dist/artifacts/ecs

cat > dist/artifacts/ecs/task-definition.json << 'EOF'
{
  "family": "screenshot-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "{{EXECUTION_ROLE_ARN}}",
  "taskRoleArn": "{{TASK_ROLE_ARN}}",
  "containerDefinitions": [
    {
      "name": "screenshot-service",
      "image": "{{ECR_IMAGE_URI}}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "{{NODE_ENV}}"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "AWS_REGION",
          "value": "{{AWS_REGION}}"
        },
        {
          "name": "DYNAMODB_TABLE_NAME",
          "value": "{{DYNAMODB_TABLE_NAME}}"
        },
        {
          "name": "SQS_QUEUE_URL",
          "value": "{{SQS_QUEUE_URL}}"
        },
        {
          "name": "S3_BUCKET_NAME",
          "value": "{{S3_BUCKET_NAME}}"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/screenshot-service",
          "awslogs-region": "{{AWS_REGION}}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:3000/health || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

echo "✅ ECS task definition created"
echo ""

# Create deployment manifest
echo "📦 Creating deployment manifest..."
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_ID=$(date +"%Y%m%d%H%M%S")

cat > dist/artifacts/deployment-manifest.json << EOF
{
  "service": "screenshot-service",
  "version": "1.0.0",
  "buildId": "${BUILD_ID}",
  "timestamp": "${TIMESTAMP}",
  "artifacts": {
    "lambda": {
      "createScreenshot": "lambda/createScreenshot.zip",
      "getScreenshotStatus": "lambda/getScreenshotStatus.zip",
      "healthCheck": "lambda/healthCheck.zip"
    },
    "swagger": {
      "apiSpec": "swagger/api-spec.yaml"
    },
    "ecs": {
      "taskDefinition": "ecs/task-definition.json"
    }
  },
  "checksums": {
    "lambda/createScreenshot.zip": "$(sha256sum dist/artifacts/lambda/createScreenshot.zip | cut -d' ' -f1)",
    "lambda/getScreenshotStatus.zip": "$(sha256sum dist/artifacts/lambda/getScreenshotStatus.zip | cut -d' ' -f1)",
    "lambda/healthCheck.zip": "$(sha256sum dist/artifacts/lambda/healthCheck.zip | cut -d' ' -f1)",
    "swagger/api-spec.yaml": "$(sha256sum dist/artifacts/swagger/api-spec.yaml | cut -d' ' -f1)",
    "ecs/task-definition.json": "$(sha256sum dist/artifacts/ecs/task-definition.json | cut -d' ' -f1)"
  }
}
EOF

echo "✅ Deployment manifest created"
echo ""

echo "================================================"
echo "✅ Packaging completed successfully!"
echo "================================================"
echo ""
echo "Artifacts structure:"
echo "📁 dist/artifacts/"
echo "  ├── 📂 lambda/"
echo "  │   ├── createScreenshot.zip"
echo "  │   ├── getScreenshotStatus.zip"
echo "  │   └── healthCheck.zip"
echo "  ├── 📂 swagger/"
echo "  │   └── api-spec.yaml"
echo "  ├── 📂 ecs/"
echo "  │   └── task-definition.json"
echo "  └── 📄 deployment-manifest.json"
echo ""
echo "These artifacts can be uploaded to S3 for deployment:"
echo ""
echo "  aws s3 sync dist/artifacts/ s3://your-artifacts-bucket/"
echo ""
echo "Build ID: ${BUILD_ID}"
echo "Timestamp: ${TIMESTAMP}"