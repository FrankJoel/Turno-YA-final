from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.turno import Turno
from app.models.operador import Operador
from app.schemas.turno import TurnoCreate, TurnoOut
from app.services.turno import generar_codigo, get_turno_activo_por_dni, get_posicion_en_cola
from app.websocket.manager import manager
from datetime import datetime

router = APIRouter(prefix="/turnos", tags=["turnos"])

@router.post("/", response_model=TurnoOut)
async def crear_turno(data: TurnoCreate, db: Session = Depends(get_db)):
    operador = db.query(Operador).filter(Operador.id == data.operador_id).first()
    if not operador:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    if not operador.fila_abierta:
        raise HTTPException(status_code=400, detail="La fila está cerrada")
    existente = get_turno_activo_por_dni(data.dni_cliente, data.operador_id, db)
    if existente:
        return existente
    codigo = generar_codigo(operador, db)
    turno = Turno(
        codigo=codigo,
        dni_cliente=data.dni_cliente,
        nombre_cliente=data.nombre_cliente,
        motivo=data.motivo,
        operador_id=data.operador_id,
        push_token=data.push_token
    )
    db.add(turno)
    db.commit()
    db.refresh(turno)
    await manager.broadcast(data.operador_id, {"evento": "nuevo_turno", "turno": turno.codigo})
    return turno

@router.get("/cola/{operador_id}")
def ver_cola(operador_id: int, db: Session = Depends(get_db)):
    turnos = db.query(Turno).filter(
        Turno.operador_id == operador_id,
        Turno.estado == "esperando"
    ).order_by(Turno.id).all()
    return turnos

@router.get("/posicion/{turno_id}")
def posicion(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    pos = get_posicion_en_cola(turno, db)
    operador = db.query(Operador).filter(Operador.id == turno.operador_id).first()
    tiempo_estimado = pos * (operador.establecimiento.tolerancia_minutos if operador.establecimiento else 20)
    return {
        "codigo": turno.codigo,
        "posicion": pos,
        "tiempo_estimado_minutos": tiempo_estimado,
        "nombre_cliente": turno.nombre_cliente,
        "motivo": turno.motivo
    }

@router.post("/siguiente/{operador_id}")
async def siguiente_turno(operador_id: int, db: Session = Depends(get_db)):
    turno_actual = db.query(Turno).filter(
        Turno.operador_id == operador_id,
        Turno.estado == "atendiendo"
    ).first()
    if turno_actual:
        turno_actual.estado = "atendido"
        turno_actual.hora_atencion = datetime.utcnow()
    siguiente = db.query(Turno).filter(
        Turno.operador_id == operador_id,
        Turno.estado == "esperando"
    ).order_by(Turno.id).first()
    if siguiente:
        siguiente.estado = "atendiendo"
    db.commit()
    await manager.broadcast(operador_id, {
        "evento": "siguiente_turno",
        "turno": siguiente.codigo if siguiente else None
    })
    return {"siguiente": siguiente.codigo if siguiente else None}

@router.patch("/{turno_id}/cancelar")
async def cancelar_turno(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    turno.estado = "cancelado"
    db.commit()
    await manager.broadcast(turno.operador_id, {"evento": "turno_cancelado", "turno": turno.codigo})
    return {"mensaje": "Turno cancelado"}

@router.get("/dni/{dni}/operador/{operador_id}")
def buscar_por_dni(dni: str, operador_id: int, db: Session = Depends(get_db)):
    turno = get_turno_activo_por_dni(dni, operador_id, db)
    if not turno:
        raise HTTPException(status_code=404, detail="No hay turno activo")
    return turno