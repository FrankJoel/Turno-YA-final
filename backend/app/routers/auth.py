# backend/app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.operador import Operador
from app.schemas.operador import LoginRequest
from app.services import auth as auth_service   # ← importamos el módulo completo

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    operador = db.query(Operador).filter(Operador.username == request.username).first()
    if not operador or not auth_service.verify_password(request.password, operador.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = auth_service.create_token({
        "sub":                str(operador.id),
        "rol":                operador.rol,
        "operador_id":        operador.id,        
        "establecimiento_id": operador.establecimiento_id,  
        "puesto":             operador.puesto,
    })

    return {
        "access_token":       token,
        "token_type":         "bearer",
        "rol":                operador.rol,
        "nombre":             operador.nombre,
        "username":           operador.username,
        "operador_id":        operador.id,
        "establecimiento_id": operador.establecimiento_id,
        "puesto":             operador.puesto,
    }