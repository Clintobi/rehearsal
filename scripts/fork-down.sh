#!/usr/bin/env bash
# Stop the Surfpool fork and delete its database (it grows quickly while running).
pkill -9 -f "surfpool start" 2>/dev/null || true
sleep 1
rm -f /tmp/surfpool-fork.sqlite*
echo "fork stopped"
