---
name: i18n-string
description: Add or change user-facing text in the locale files, with key naming, plural forms and placeholders for untranslated languages.
---

# Locale strings

Texts live in `locales/en.json`, `locales/es.json` and `locales/fr.json`, nested as
`<area>.<screen>.<name>`.

- Plurals are two keys, `<name>_one` and `<name>_other`, with the number as `{count}`.
- Every key goes into all three files. English is written by you; for es and fr write the English
  text prefixed with `[[TODO]] ` so translators find it. Never leave the bare English text there.
- Keys are sorted alphabetically at every level of every file.
- Run `python3 scripts/i18n_lint.py`; it must print `ok`.
