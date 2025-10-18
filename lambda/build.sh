#!/bin/bash

# Build Lambda function deployment packages
# Usage: ./lambda/build.sh

set -e

echo "================================================"
echo "Building Lambda Functions"
echo "================================================"
echo ""

# Change to lambda directory
cd "$(dirname "$0")"

# Create dist directory
mkdir -p ../dist

# Build createScreenshot
echo "Building createScreenshot..."
cd createScreenshot
npm install --omit=dev
zip -r ../../dist/createScreenshot.zip . -x "*.git*" -x "node_modules/.cache/*" -x "package-lock.json"
cd ..

echo "✅ createScreenshot.zip created"
echo ""

# Build getScreenshotStatus
echo "Building getScreenshotStatus..."
cd getScreenshotStatus
npm install --omit=dev
zip -r ../../dist/getScreenshotStatus.zip . -x "*.git*" -x "node_modules/.cache/*" -x "package-lock.json"
cd ..

echo "✅ getScreenshotStatus.zip created"
echo ""

echo "================================================"
echo "✅ Build completed successfully!"
echo "================================================"
echo ""
echo "Output files:"
echo "  - dist/createScreenshot.zip"
echo "  - dist/getScreenshotStatus.zip"
echo ""
echo "These files can be used in your Terraform project:"
echo ""
echo "  resource \"aws_lambda_function\" \"create_screenshot\" {"
echo "    filename         = \"../screenshot-service-be/dist/createScreenshot.zip\""
echo "    source_code_hash = filebase64sha256(\"../screenshot-service-be/dist/createScreenshot.zip\")"
echo "    ..."
echo "  }"
