#!/usr/bin/env bash
# Yerel inceleme sunucusu (serve-dist dosyaları önbelleğe alır → her derlemeden sonra yeniden başlat).
cd "$(dirname "$0")/../.."
for pid in $(pgrep -f "node scripts/serve-dist.mjs --dir dist --port 4392"); do kill "$pid"; done
sleep 1
setsid node scripts/serve-dist.mjs --dir dist --port 4392 > /dev/null 2>&1 < /dev/null &
sleep 1
