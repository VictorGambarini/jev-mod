"""Turn a title into a URL slug."""
import re
import unicodedata

# characters that do not decompose into a letter and an accent
TRANSLITERATE = {"ß": "ss", "æ": "ae", "œ": "oe", "þ": "th"}


def slugify(text, max_len=60):
    for ch, repl in TRANSLITERATE.items():
        text = text.replace(ch, repl).replace(ch.upper(), repl.upper())
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    if len(text) > max_len:
        text = text[:max_len].rsplit("-", 1)[0]
    return text
