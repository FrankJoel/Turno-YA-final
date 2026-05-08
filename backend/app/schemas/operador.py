from pydantic import BaseModel
from typing import Optional, List

class ServicioBase(BaseModel):
    motivo: str
    tiempo_estimado: str

    class Config:
        from_attributes = True
class OperadorCreate(BaseModel):
    nombre: str
    apellido: str
    dni: str
    puesto: str
    rol: str = "operador"
    establecimiento_id: int
    servicios: List[ServicioBase] = []

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
    #Opcional: devolver los servicios también en el GET
    servicios: List[ServicioBase] = []

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    username: str
    password: str