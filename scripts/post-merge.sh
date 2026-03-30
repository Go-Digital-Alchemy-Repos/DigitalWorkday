#!/bin/bash
set -e
npm install --prefer-offline
echo "Running TypeScript typecheck..."
npm run check
