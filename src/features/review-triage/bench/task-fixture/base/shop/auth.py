"""Passwords and tokens."""
import functools
import hashlib
import hmac
import os
import time

SECRET = os.environ.get("SHOP_SECRET", "dev-secret").encode()
TOKEN_TTL = 3600


def hash_password(password, salt=None):
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def verify_password(password, stored):
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored)


def make_token(user_id, role, now=None):
    expires = int((now or time.time()) + TOKEN_TTL)
    body = f"{user_id}:{role}:{expires}"
    sig = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}:{sig}"


def verify_token(token, now=None):
    """The token's user id and role, or None if it is forged or expired."""
    try:
        user_id, role, expires, sig = token.split(":")
    except (ValueError, AttributeError):
        return None
    body = f"{user_id}:{role}:{expires}"
    good = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good):
        return None
    if int(expires) < (now or time.time()):
        return None
    return {"user_id": int(user_id), "role": role}


def require_admin(handler):
    """Wrap a handler so only an admin token reaches it."""
    @functools.wraps(handler)
    def wrapped(request):
        who = verify_token(request.get("token"))
        if not who or who["role"] != "admin":
            return {"status": 403, "error": "admin only"}
        return handler(request)
    return wrapped
