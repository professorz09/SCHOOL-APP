#!/bin/bash
set -e

echo "==> Installing npm packages..."
npm install --no-audit --no-fund

echo "==> Post-merge setup complete!"
