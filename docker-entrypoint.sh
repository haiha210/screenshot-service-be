#!/bin/sh
set -e

echo "=========================================="
echo "Starting Screenshot Service"
echo "=========================================="

# Check if running in Docker with LocalStack
if [ "$USE_LOCALSTACK" = "true" ] || [ -n "$AWS_ENDPOINT" ]; then
  echo ""
  echo "LocalStack environment detected"
  echo "Initializing AWS resources..."
  echo ""

  # Run initialization script
  sh /usr/src/app/scripts/init-awslocal.sh

  echo ""
  echo "✓ AWS resources initialized"
  echo ""
fi

# Start the application
echo "Starting application..."
exec "$@"
