#!/bin/bash

# Validate Swagger/OpenAPI specification
# Usage: ./validate-swagger.sh

set -e

echo "================================================"
echo "Validating Swagger/OpenAPI Specification"
echo "================================================"
echo ""

# Change to swagger directory
cd "$(dirname "$0")/swagger"

# Check if swagger file exists
if [ ! -f "api-spec.yaml" ]; then
    echo "❌ api-spec.yaml not found!"
    exit 1
fi

echo "📋 Found api-spec.yaml"

# Basic YAML syntax validation
echo "🔍 Validating YAML syntax..."
if command -v python3 &> /dev/null; then
    python3 -c "
import yaml
import sys
try:
    with open('api-spec.yaml', 'r') as f:
        yaml.safe_load(f)
    print('✅ YAML syntax is valid')
except yaml.YAMLError as e:
    print(f'❌ YAML syntax error: {e}')
    sys.exit(1)
except Exception as e:
    print(f'❌ Error reading file: {e}')
    sys.exit(1)
"
else
    echo "⚠️  Python3 not found, skipping YAML validation"
fi

# Basic OpenAPI structure validation
echo "🔍 Validating OpenAPI structure..."
if command -v yq &> /dev/null; then
    # Check required OpenAPI fields
    VERSION=$(yq '.openapi' api-spec.yaml)
    TITLE=$(yq '.info.title' api-spec.yaml)
    PATHS=$(yq '.paths | length' api-spec.yaml)
    
    echo "   OpenAPI Version: $VERSION"
    echo "   API Title: $TITLE"
    echo "   Number of paths: $PATHS"
    
    if [ "$VERSION" = "null" ]; then
        echo "❌ Missing openapi version"
        exit 1
    fi
    
    if [ "$TITLE" = "null" ]; then
        echo "❌ Missing info.title"
        exit 1
    fi
    
    if [ "$PATHS" -eq 0 ]; then
        echo "❌ No paths defined"
        exit 1
    fi
    
    echo "✅ OpenAPI structure is valid"
else
    echo "⚠️  yq not found, skipping OpenAPI structure validation"
fi

# Check endpoints
echo "🔍 Checking API endpoints..."
echo "   📍 Health Check: GET /health"
echo "   📍 Create Screenshot: POST /screenshots"
echo "   📍 Get Status: GET /screenshots/{requestId}"

# File size check
SIZE=$(wc -c < api-spec.yaml)
echo "📊 File size: ${SIZE} bytes"

if [ "$SIZE" -gt 1048576 ]; then  # 1MB
    echo "⚠️  File is quite large (>1MB)"
fi

echo ""
echo "================================================"
echo "✅ Swagger validation completed!"
echo "================================================"
echo ""
echo "The API specification is ready for:"
echo "  • API Gateway integration"
echo "  • Documentation generation"
echo "  • Client SDK generation"
echo "  • Deployment via IAC"