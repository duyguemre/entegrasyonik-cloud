#!/bin/sh
# K85: yasakli e-posta adresi (urun sahibinin isyeri adresi) commit kimliginde ve mesajinda gecmez.
# Adres duz metin tutulmaz; kucuk harfli SHA-256 ozeti karsilastirilir.
# Kurulum (bir kez, yerel depoda): git config core.hooksPath scripts/githooks
BANNED_SHA256="5e5dea7ed5fcd30f5d03fc3f063ee8bafaada2d8f5b175637d947e5e50bc4dd2"

# stdin'deki metinde yasakli adres var mi? (0 = var)
has_banned() {
    grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | tr 'A-Z' 'a-z' | while read -r e; do
        h=$(printf '%s' "$e" | sha256sum | cut -d' ' -f1)
        [ "$h" = "$BANNED_SHA256" ] && echo hit && break
    done | grep -q hit
}
