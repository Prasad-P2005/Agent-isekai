"""FastAPI application: serves the API, the game's data and the browser client."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import config
from .api.routes import router
from .core.game import Game

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(game: Game | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.game = game or Game()
        app.state.game.start()
        yield

    app = FastAPI(title="Isekai Realms", lifespan=lifespan)
    app.include_router(router)
    app.mount("/content", StaticFiles(directory=config.CONTENT_DIR), name="content")
    app.mount("/", StaticFiles(directory=config.CLIENT_DIR, html=True), name="client")
    return app


app = create_app()
