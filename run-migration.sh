#!/bin/bash

# Database URL
DATABASE_URL="postgresql://neondb_owner:npg_85HtyvWDVGfg@ep-damp-silence-ai3la3br-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Run migration
psql "$DATABASE_URL" < lib/db/migrations/add-delivery-orders.sql

echo "Migration completed!"
