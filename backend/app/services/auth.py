# app/services/auth.py
import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
import os

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "clave-secreta-default")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480))

# Esquema Bearer — FastAPI lo usa para mostrar el candado en /docs
bearer_scheme = HTTPBearer()


# ── CRYPTO ────────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── TOKEN ─────────────────────────────────────────────────────────────────────

def create_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ── DEPENDENCIAS FASTAPI ───────────────────────────────────────────────────────

def get_current_operador(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """
    Dependencia base: valida el JWT y devuelve el Operador de la DB.
    Usala en cualquier endpoint que requiera estar autenticado.
    """
    from app.models.operador import Operador  # import local para evitar circular

    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        operador_id: str = payload.get("sub")
        if operador_id is None:
            raise exc
    except JWTError:
        raise exc

    operador = db.query(Operador).filter(Operador.id == int(operador_id)).first()
    if not operador or not operador.activo:
        raise exc

    return operador


def require_operador(operador=Depends(get_current_operador)):
    """
    Dependencia para endpoints de operador o admin.
    Bloquea si el rol no es 'operador' ni 'admin'.
    """
    if operador.rol not in ("operador", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de operador",
        )
    return operador


def require_admin(operador=Depends(get_current_operador)):
    """
    Dependencia para endpoints exclusivos de admin.
    """
    if operador.rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador",
        )
    return operador