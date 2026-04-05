from fastapi import Header, HTTPException, status

from .config import settings


def _extract_token(authorization: str | None, x_api_token: str | None) -> str:
    if authorization and authorization.lower().startswith('bearer '):
        return authorization[7:].strip()
    if x_api_token:
        return x_api_token.strip()
    return ''


def require_api_token(authorization: str | None = Header(default=None), x_api_token: str | None = Header(default=None)) -> None:
    expected_token = settings.api_bearer_token or settings.api_token
    if not expected_token:
        return

    token = _extract_token(authorization, x_api_token)
    if token != expected_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Неверный API токен')


def require_admin_token(token: str | None, x_admin_token: str | None = Header(default=None)) -> None:
    final_token = token or x_admin_token or ''
    if final_token != settings.admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Неверный токен администратора')
