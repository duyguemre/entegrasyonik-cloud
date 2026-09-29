#!/usr/bin/env bash
# Bulut ortamı kurulum betiği (claude.ai/code → Environment → setup script). Ayrıntı: docs/CLOUD_BRIEFS.md.
# Sır/DB/Redis gerekmez; yalnızca önyüz bağımlılıkları.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd site && npm ci && npx playwright install --with-deps chromium)
(cd frontend && npm ci)
echo "cloud-setup: site + frontend hazır"
