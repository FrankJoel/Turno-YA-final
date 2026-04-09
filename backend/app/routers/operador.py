from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.operador import Operador
from app.schemas.operador import OperadorCreate, OperadorOut
from app.services.auth import hash_password
import re

router = APIRouter(prefix="/operadores", tags=["operadores"])

def generar_username(nombre: str, apellido: str, db: Session) -> str:
    base = re.sub(r'[^a-z0-9]', '', f"{nombre}{apellido}".lower())
    username = base
    contador = 1
    while db.query(Operador).filter(Operador.username == username).first():
        username = f"{base}{contador}"
        contador += 1
    return username

@router.post("/", response_model=OperadorOut)
def crear_operador(data: OperadorCreate, db: Session = Depends(get_db)):
    username = generar_username(data.nombre, data.apellido, db)
    password_temp = f"{data.nombre.lower()}{data.dni[-4:]}"
    operador = Operador(
        nombre=data.nombre,
        apellido=data.apellido,
        username=username,
        password_hash=hash_password(password_temp),
        dni=data.dni,
        puesto=data.puesto,
        rol=data.rol,
        establecimiento_id=data.establecimiento_id
    )
    db.add(operador)
    db.commit()
    db.refresh(operador)
    return operador

@router.get("/", response_model=list[OperadorOut])
def listar_operadores(establecimiento_id: int, db: Session = Depends(get_db)):
    return db.query(Operador).filter(
        Operador.establecimiento_id == establecimiento_id,
        Operador.activo == True
    ).all()

@router.patch("/{operador_id}/fila")
def toggle_fila(operador_id: int, db: Session = Depends(get_db)):
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    op.fila_abierta = not op.fila_abierta
    db.commit()
    return {"fila_abierta": op.fila_abierta}

@router.patch("/{operador_id}/toggle")
def toggle_activo(operador_id: int, db: Session = Depends(get_db)):
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    op.activo = not op.activo
    db.commit()
    return {"activo": op.activo}