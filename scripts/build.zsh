#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
docker-compose build app
