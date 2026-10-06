#!/usr/bin/env bash
# Serves the Waterfall extension on http://localhost:8767 — the URL declared in
# waterfall.trex — and lists Tableau shape palettes for the Format dialog's icon picker.
# Dev preview (no Tableau needed): http://localhost:8767/dev/preview.html
set -euo pipefail
cd "$(dirname "$0")"
exec python3 serve.py
