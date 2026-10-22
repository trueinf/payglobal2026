"""WebSocket hub: every connected app gets every event and every agent step."""
from __future__ import annotations
import asyncio, json
from fastapi import WebSocket
from .db import jsonable

class Hub:
    def __init__(self): self.clients: set[WebSocket] = set()
    async def connect(self, ws: WebSocket):
        await ws.accept(); self.clients.add(ws)
    def disconnect(self, ws: WebSocket): self.clients.discard(ws)
    async def broadcast(self, kind: str, data: dict):
        msg = json.dumps(dict(kind=kind, data=jsonable(data, camelize=True)), default=str)
        dead = []
        for ws in list(self.clients):
            try: await ws.send_text(msg)
            except Exception: dead.append(ws)
        for ws in dead: self.disconnect(ws)

hub = Hub()
