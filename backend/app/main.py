from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import auth, operador, turno, estadisticas
from app.websocket.manager import manager

# --- AGREGA ESTAS IMPORTACIONES AQUÍ ---
# Deben importarse ANTES de create_all para que SQLAlchemy registre las tablas
from app.models.establecimiento import Establecimiento
from app.models.operador import Operador
from app.models.turno import Turno
# ---------------------------------------

# Ahora sí, SQLAlchemy ya conoce los modelos y el orden de sus llaves foráneas
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TurnoYa API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(operador.router)
app.include_router(turno.router)
app.include_router(estadisticas.router)

@app.get("/")
def root():
    return {"status": "TurnoYa API corriendo"}

@app.websocket("/ws/{operador_id}")
async def websocket_endpoint(websocket: WebSocket, operador_id: int):
    await manager.connect(websocket, operador_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, operador_id)