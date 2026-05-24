# app/routers/establecimiento.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.establecimiento import Establecimiento
from app.models.operador import Operador
from app.services.auth import require_admin

router = APIRouter(prefix="/establecimientos", tags=["establecimientos"])


# ── SCHEMA ────────────────────────────────────────────────────────────────────

class EstablecimientoOut(BaseModel):
    id: int
    nombre: str
    rubro: Optional[str] = None
    tolerancia_minutos: Optional[int] = 20
    activo: bool

    class Config:
        from_attributes = True


class EstablecimientoUpdate(BaseModel):
    nombre: str
    rubro: Optional[str] = None
    tolerancia_minutos: Optional[int] = 20


# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@router.get("/{establecimiento_id}", response_model=EstablecimientoOut)
def get_establecimiento(
    establecimiento_id: int,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    est = db.query(Establecimiento).filter(Establecimiento.id == establecimiento_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Establecimiento no encontrado")
    return est


@router.put("/{establecimiento_id}", response_model=EstablecimientoOut)
def update_establecimiento(
    establecimiento_id: int,
    data: EstablecimientoUpdate,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    est = db.query(Establecimiento).filter(Establecimiento.id == establecimiento_id).first()
    if not est:
        raise HTTPException(status_code=404, detail="Establecimiento no encontrado")

    est.nombre = data.nombre
    est.rubro = data.rubro
    est.tolerancia_minutos = data.tolerancia_minutos

    db.commit()
    db.refresh(est)
    return est