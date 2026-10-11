#!/bin/sh
# the whole test suite
cd "$(dirname "$0")/.." && python3 -m unittest discover tests
