#!/bin/sh
set -e

echo "Applying database migrations…"
node node_modules/prisma/build/index.js migrate deploy

echo "Starting Foyer…"
exec node server.js
