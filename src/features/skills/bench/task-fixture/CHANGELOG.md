# Changelog

## [Unreleased]

### Added
* **refunds** — partial refunds can now be issued from the admin page (#471)

### Changed
* **orders** — order totals are rounded once, after all lines are summed (#466)

### Fixed
* **inventory** — SKUs with a trailing space no longer fail lookup (#473)

### Operator notes

## [1.8.0] - 2026-09-24

### Added
* **webhooks** — a delivery log page for partner endpoints (#431)

### Fixed
* **orders** — duplicate order ids on retry (#425)

### Operator notes
* **queue** — the worker pool defaults to 8 processes instead of 4 (#440)

## [1.7.2] - 2026-09-10

### Fixed
* **refunds** — refund emails showed the charge amount (#412)
