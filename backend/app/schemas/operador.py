from pydantic import BaseModel
from typing import Optional

class OperadorCreate(BaseModel):
    nombre: str
    apellido: str
    dni: str
    puesto: str
    rol: str = "operador"
    establecimiento_id: int

class OperadorOut(BaseModel):
    id: int
    nombre: str
    apellido: str
    username: str
    dni: str
    puesto: str
    rol: str
    fila_abierta: bool
    activo: bool

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    username: str
    password: str