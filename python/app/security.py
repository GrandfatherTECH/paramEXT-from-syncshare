from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Header, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import settings

if TYPE_CHECKING:
    from .database import Database

_db: Database | None = None
_signer: URLSafeTimedSerializer | None = None

ADMIN_COOKIE = 'paramext_admin'
ADMIN_MAX_AGE = 86400  # 24 hours


def set_database_ref(db: Database) -> None:
    global _db
    _db = db


def _get_signer() -> URLSafeTimedSerializer:
    global _signer
    if _signer is None:
        _signer = URLSafeTimedSerializer(settings.admin_secret_key)
    return _signer


def _extract_token(authorization: str | None, x_api_token: str | None) -> str:
    if authorization and authorization.lower().startswith('bearer '):
        return authorization[7:].strip()
    if x_api_token:
        return x_api_token.strip()
    return ''


async def require_api_token(
    authorization: str | None = Header(default=None),
    x_api_token: str | None = Header(default=None),
) -> int | None:
    token = _extract_token(authorization, x_api_token)

    # Master token from env — grants access without a user record.
    master = settings.api_bearer_token or settings.api_token
    if master and token == master:
        return None

    # Per-user token from DB.
    if token and _db:
        user = await _db.get_user_by_token(token)
        if user:
            await _db.touch_user_activity(user['id'])
            return int(user['id'])

    # Open access when no master token is configured.
    if not master:
        return None

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='API токен не предоставлен')
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Неверный API токен')


def require_admin_session(
    request: Request,
    token: str | None = None,
    x_admin_token: str | None = Header(default=None),
) -> None:
    # 1. Check signed cookie.
    cookie_value = request.cookies.get(ADMIN_COOKIE, '')
    if cookie_value:
        try:
            data = _get_signer().loads(cookie_value, max_age=ADMIN_MAX_AGE)
            if data == settings.admin_token:
                return
        except (BadSignature, SignatureExpired):
            pass

    # 2. Fallback: query param or header (backward compat).
    final_token = token or x_admin_token or ''
    if final_token == settings.admin_token:
        return

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Требуется авторизация')


def create_admin_cookie_value() -> str:
    return _get_signer().dumps(settings.admin_token)
