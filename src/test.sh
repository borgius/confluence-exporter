#!/bin/bash

# Test script for minimal Confluence exporter
# This script demonstrates how to test the exporter

echo "╔════════════════════════════════════════════════════╗"
echo "║   Testing Minimal Confluence Exporter             ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js version is adequate
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18+ required (current: $(node --version))"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo ""

# Build the project
echo "📦 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✓ Build successful"
echo ""

# Check if environment variables are set
if [ -z "$CONFLUENCE_BASE_URL" ] || [ -z "$CONFLUENCE_USERNAME" ] || [ -z "$CONFLUENCE_PASSWORD" ] || [ -z "$CONFLUENCE_SPACE_KEY" ]; then
    echo "⚠️  Environment variables not set. Please set:"
    echo ""
    echo "  export CONFLUENCE_BASE_URL='https://your-instance.atlassian.net'"
    echo "  export CONFLUENCE_USERNAME='your-email@example.com'"
    echo "  export CONFLUENCE_PASSWORD='your-api-token'"
    echo "  export CONFLUENCE_SPACE_KEY='YOURSPACE'"
    echo "  export CONFLUENCE_OUTPUT_DIR='./test-output'  # optional"
    echo ""
    echo "Or provide as command line arguments:"
    echo "  npm run start -- <baseUrl> <username> <password> <spaceKey> [outputDir]"
    echo ""
    exit 1
fi

# Run the exporter
echo "🚀 Running export..."
echo "   Space: $CONFLUENCE_SPACE_KEY"
echo "   Output: ${CONFLUENCE_OUTPUT_DIR:-./output}"
echo ""

npm run start

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Test completed successfully!"
    echo ""
    echo "Check the output directory for exported markdown files."
else
    echo ""
    echo "❌ Test failed!"
    exit 1
fi
