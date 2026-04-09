from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.operador import Operador
from app.schemas.operador import LoginRequest
from app.services.auth import verify_password, create_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    operador = db.query(Operador).filter(Operador.username == request.username).first()
    if not operador or not verify_password(request.password, operador.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = create_token({"sub": str(operador.id), "rol": operador.rol})
    return {
        "access_token": token,
        "token_type": "bearer",
        "rol": operador.rol,
        "nombre": operador.nombre,
        "operador_id": operador.id
    }