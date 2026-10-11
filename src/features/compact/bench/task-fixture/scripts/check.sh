#!/bin/sh
# The full check: every module compiles, then the whole suite runs.
set -e
cd "$(dirname "$0")/.."
python3 -m compileall -q billing tests
python3 -m unittest discover -s tests -t . -v
