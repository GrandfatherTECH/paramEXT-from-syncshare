from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .admin import admin_router
from .bot import start_bot, stop_bot
from .config import settings
from .database import database
from .schemas import LogPayloadIn, OpenEduAttemptIn, OpenEduSolutionsQueryIn
from .security import require_api_token, set_database_ref
from .telegram import spawn_forward


@asynccontextmanager
async def lifespan(_: FastAPI):
    await database.connect()
    set_database_ref(database)
    await start_bot(database)
    try:
        yield
    finally:
        await stop_bot()
        await database.disconnect()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'https://paramext.ruka.me',
        'https://syncshare.naloaty.me',
        'https://syncshare.ru',
    ],
    allow_origin_regex=r'^(https://([a-z0-9-]+\.)?openedu\.ru|chrome-extension://[a-z]{32})$',
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
    max_age=86400,
)

app.include_router(admin_router)


# ── Health ─────────────────────────────────────────────────────────

@app.get('/')
@app.get('/api')
async def root() -> dict:
    return {'service': settings.app_name, 'env': settings.app_env, 'status': 'ok'}


@app.get('/health')
@app.get('/healthz')
@app.get('/api/health')
@app.get('/api/healthz')
async def healthcheck() -> dict:
    return {
        'status': 'ok',
        'service': settings.app_name,
        'env': settings.app_env,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    }


@app.get('/v2/status')
@app.get('/api/v2/status')
async def legacy_status() -> dict:
    return {'maintenance': False, 'highDemand': False}


@app.get('/v2/update')
@app.get('/api/v2/update')
async def legacy_update() -> dict:
    return {'updateRequired': False, 'latestVersion': '2.9.0'}


# ── OpenEdu API ────────────────────────────────────────────────────

@app.post('/v1/openedu/attempts')
@app.post('/api/v1/openedu/attempts')
async def post_openedu_attempt(payload: OpenEduAttemptIn, user_id: int | None = Depends(require_api_token)) -> dict:
    await database.upsert_openedu_attempt(payload.model_dump(), user_id=user_id)
    return {'ok': True}


@app.post('/v1/openedu/solutions/query')
@app.post('/api/v1/openedu/solutions/query')
async def post_openedu_query(payload: OpenEduSolutionsQueryIn, user_id: int | None = Depends(require_api_token)) -> dict:
    stats = await database.query_openedu_stats(payload.context.testKey, payload.questionKeys)
    return {'statsByQuestion': stats}


# ── Client logs (DB write retired, Telegram forwarding kept) ───────

@app.post('/v1/logs/client')
@app.post('/api/v1/logs/client')
async def post_extension_log(payload: LogPayloadIn, user_id: int | None = Depends(require_api_token)) -> dict:
    serialized = payload.model_dump()
    spawn_forward(serialized['kind'], serialized['payload'], serialized['system'])
    return {'ok': True}
