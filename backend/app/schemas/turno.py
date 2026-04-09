from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TurnoCreate(BaseModel):
    dni_cliente: str
    nombre_cliente: str
    motivo: str
    operador_id: int
    push_token: Optional[str] = None

class TurnoOut(BaseModel):
    id: int
    codigo: str
    dni_cliente: str
    nombre_cliente: str
    motivo: str
    estado: str
    hora_entrada: datetime
    operador_id: int

    class Config:
        from_attributes = True