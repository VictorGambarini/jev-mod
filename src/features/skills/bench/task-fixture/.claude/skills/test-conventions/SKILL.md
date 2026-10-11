---
name: test-conventions
description: How to write tests in this project: unittest layout, naming, fixtures and what to cover when adding or changing behaviour.
---

# Test conventions

Plain `unittest`, one test file per module in `tests/`, classes named `<Thing>Test`. Test names
say the behaviour (`test_refund_over_the_charge_raises`). Cover the normal case, the edge and the
failure. A bug fix starts with a failing test. Do not change an existing test to make it pass.
