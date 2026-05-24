from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        # Mantiene las conexiones activas por operador_id
        self.connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, operador_id: int):
        await websocket.accept()
        if operador_id not in self.connections:
            self.connections[operador_id] = []
        self.connections[operador_id].append(websocket)

    def disconnect(self, websocket: WebSocket, operador_id: int):
        if operador_id in self.connections:
            if websocket in self.connections[operador_id]:
             self.connections[operador_id].remove(websocket)
        
        #  Limpieza de memoria ---
        if not self.connections[operador_id]:
            del self.connections[operador_id]

    async def broadcast(self, operador_id: int, message: dict):
        """Envía actualizaciones en tiempo real a TV, Operador y Cliente"""
        if operador_id in self.connections:
            # Iteramos sobre una copia de la lista para poder remover si falla
            for ws in list(self.connections[operador_id]):
                try:
                    await ws.send_json(message)
                except Exception:
                    # Si falla el envío, desconectamos el socket problemático
                    self.disconnect(ws, operador_id)

manager = ConnectionManager()