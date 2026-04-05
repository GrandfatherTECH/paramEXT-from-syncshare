from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from .config import settings
from .database import database
from .schemas import LogPayloadIn, OpenEduAttemptIn, OpenEduSolutionsQueryIn
from .security import require_admin_token, require_api_token
from .telegram import spawn_forward


templates = Jinja2Templates(directory='app/templates')


@asynccontextmanager
async def lifespan(_: FastAPI):
    await database.connect()
    try:
        yield
    finally:
        await database.disconnect()


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.get('/healthz')
async def healthcheck() -> dict:
    return {
        'status': 'ok',
        'service': settings.app_name,
        'env': settings.app_env,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    }


@app.post('/v1/openedu/attempts', dependencies=[Depends(require_api_token)])
async def post_openedu_attempt(payload: OpenEduAttemptIn) -> dict:
    await database.upsert_openedu_attempt(payload.model_dump())
    return {'ok': True}


@app.post('/v1/openedu/solutions/query', dependencies=[Depends(require_api_token)])
async def post_openedu_query(payload: OpenEduSolutionsQueryIn) -> dict:
    stats = await database.query_openedu_stats(payload.context.testKey, payload.questionKeys)
    return {'statsByQuestion': stats}


@app.post('/v1/logs/client', dependencies=[Depends(require_api_token)])
async def post_extension_log(payload: LogPayloadIn) -> dict:
    serialized = payload.model_dump()
    await database.write_log(serialized['kind'], serialized['payload'], serialized['system'])
    spawn_forward(serialized['kind'], serialized['payload'], serialized['system'])
    return {'ok': True}


@app.get('/admin', response_class=HTMLResponse)
async def admin_dashboard(request: Request, token: str | None = None, x_admin_token: str | None = None):
    require_admin_token(token=token, x_admin_token=x_admin_token)
    snapshot = await database.get_admin_snapshot()
    return templates.TemplateResponse(
        request=request,
        name='admin.html',
        context={
            'app_name': settings.app_name,
            'snapshot': snapshot,
        },
    )


@app.get('/admin/data')
async def admin_data(token: str | None = None, x_admin_token: str | None = None):
    require_admin_token(token=token, x_admin_token=x_admin_token)
    snapshot = await database.get_admin_snapshot()
    return JSONResponse(snapshot)
