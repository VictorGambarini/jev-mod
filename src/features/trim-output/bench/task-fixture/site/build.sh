#!/bin/sh
# Builds the site: compiles every asset and template into dist/.
set -e
cd "$(dirname "$0")"
rm -rf dist
python3 tools/build.py
echo "build finished"
