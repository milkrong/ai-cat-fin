#!/bin/sh
set -e

if [ "${SKIP_PRISMA_MIGRATE:-0}" != "1" ]; then
  echo "Running Prisma migrations..."
  ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma
fi

exec node server.js
