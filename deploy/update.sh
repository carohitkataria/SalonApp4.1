#!/usr/bin/env bash
# Pull the latest code for SalonHub (and Shifain, if it is cloned next to it),
# rebuild each part one at a time (a 2 GB server cannot build them in parallel)
# and restart. Run from anywhere:  ~/salonhub/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
if [ -d ../shifain/.git ]; then git -C ../shifain pull --ff-only; fi
for service in $(docker compose config --services); do
  echo "== building $service"
  docker compose build "$service"
done
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
docker compose ps
