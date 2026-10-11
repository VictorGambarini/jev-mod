---
name: perf-profile
description: Profile slow Python code and find the hot spot using cProfile, with before and after timings.
---

# Profiling

Reproduce with a script, run `python3 -m cProfile -s cumtime script.py | head -30`, find the top
cumulative entries in our own code, change one thing, and measure again. Keep the before and
after numbers in the PR.
