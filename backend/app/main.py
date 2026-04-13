from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import auth, operador, turno, estadisticas # Ya incluye estadísticas
from app.websocket.manager import manager

# --- IMPORTACIÓN DE MODELOS ---
# Importante: Mantener esto para que SQLAlchemy cree las tablas correctamente
from app.models.establecimiento import Establecimiento
from app.models.operador import Operador
from app.models.turno import Turno

# Crear tablas en la base de datos
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TurnoYa API")

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro de Rutas (Routers)
app.include_router(auth.router)
app.include_router(operador.router)
app.include_router(turno.router)
app.include_router(estadisticas.router) # Endpoint unificado de estadísticas activo

@app.get("/")
def root():
    return {"status": "TurnoYa API corriendo", "version": "1.0.0"}

# Manejo de WebSockets para tiempo real
@app.websocket("/ws/{operador_id}")
async def websocket_endpoint(websocket: WebSocket, operador_id: int):
    await manager.connect(websocket, operador_id)
    try:
        while True:
            # Mantiene la conexión abierta esperando mensajes (aunque no los usemos aún)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, operador_id)