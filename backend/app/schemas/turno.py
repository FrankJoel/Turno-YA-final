# app/schemas/turno.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class TurnoCreate(BaseModel):
    dni_cliente: str
    nombre_cliente: str
    motivo: str
    operador_id: int
    establecimiento_id: int = 1

class TurnoOut(BaseModel):
    id: int
    codigo: str
    dni_cliente: str
    nombre_cliente: str
    motivo: str
    estado: str
    operador_id: int
    hora_entrada: datetime
    hora_finalizacion_estimada: Optional[datetime] = None

    class Config:
        from_attributes = True