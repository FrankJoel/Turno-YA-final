from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        self.connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, operador_id: int):
        await websocket.accept()
        if operador_id not in self.connections:
            self.connections[operador_id] = []
        self.connections[operador_id].append(websocket)

    def disconnect(self, websocket: WebSocket, operador_id: int):
        if operador_id in self.connections:
            self.connections[operador_id].remove(websocket)

    async def broadcast(self, operador_id: int, message: dict):
        if operador_id in self.connections:
            for ws in self.connections[operador_id]:
                try:
                    await ws.send_json(message)
                except:
                    pass

manager = ConnectionManager()