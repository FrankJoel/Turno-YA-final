# app/routers/turno.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import asc
from app.database import get_db
from app.models.turno import Turno
from app.models.operador import Operador
from app.schemas import turno as schemas
from app.websocket.manager import manager
from app.services.notificaciones import enviar_push
from app.services.auth import require_operador, require_admin
from datetime import datetime, timedelta

router = APIRouter(prefix="/turnos", tags=["turnos"])


# ── HELPERS ────────────────────────────────────────────────────────────────────

def parsear_duracion_minutos(tiempo_estimado: str, default: int = 20) -> int:
    if not tiempo_estimado or not isinstance(tiempo_estimado, str):
        return default
    partes = tiempo_estimado.strip().split(':')
    try:
        if len(partes) == 2:
            return int(partes[0]) * 60 + int(partes[1])
        elif len(partes) == 1:
            return int(partes[0])
        return default
    except (ValueError, TypeError):
        return default


def generar_codigo_ticket(operador: Operador, db: Session) -> str:
    from datetime import date
    hoy = date.today()
    cantidad = db.query(Turno).filter(
        Turno.operador_id == operador.id,
        Turno.hora_entrada >= hoy
    ).count()
    return f"{operador.puesto}-{cantidad + 1:03d}"


# ── CREAR TURNO (cliente desde QR — SIN autenticación) ────────────────────────

@router.post("/", response_model=schemas.TurnoOut)
def crear_turno(payload: schemas.TurnoCreate, db: Session = Depends(get_db)):
    operador = db.query(Operador).filter(Operador.id == payload.operador_id).first()
    if not operador:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    if not operador.fila_abierta:
        raise HTTPException(
            status_code=403,
            detail="La fila de este operador está cerrada actualmente. No se aceptan nuevos turnos."
        )

    config_servicio = next(
        (s for s in operador.servicios if s.motivo == payload.motivo), None
    )
    duracion_minutos = parsear_duracion_minutos(
        config_servicio.tiempo_estimado if config_servicio else None
    )

    nuevo_turno = Turno(
        codigo=generar_codigo_ticket(operador, db),
        dni_cliente=payload.dni_cliente,
        nombre_cliente=payload.nombre_cliente,
        motivo=payload.motivo,
        operador_id=payload.operador_id,
        estado="esperando",
        hora_finalizacion_estimada=datetime.utcnow() + timedelta(minutes=duracion_minutos),
    )
    db.add(nuevo_turno)
    db.commit()
    db.refresh(nuevo_turno)
    return nuevo_turno


# ── COLA DE ESPERA - publico  ───────────────────────────────

@router.get("/cola/{operador_id}")
def get_cola(operador_id: int, db: Session = Depends(get_db)):
    turnos = (
        db.query(Turno)
        .filter(Turno.operador_id == operador_id, Turno.estado == "esperando")
        .order_by(asc(Turno.hora_entrada))
        .all()
    )
    return turnos


# ── ESTADO ACTUAL — publico ─────────────────────────────────────────────────

@router.get("/estado_actual/{operador_id}")
def get_estado_actual(operador_id: int, db: Session = Depends(get_db)):
    turno = (
        db.query(Turno)
        .filter(
            Turno.operador_id == operador_id,
            Turno.estado.in_(["llamando", "atendiendo"])
        )
        .first()
    )
    return turno or {}


# ── POSICIÓN EN LA COLA (pantalla del cliente — SIN autenticación) ─────────────

@router.get("/posicion/{turno_id}")
def get_posicion(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")

    if turno.estado in ["atendiendo", "llamando"]:
        posicion = 0
        tiempo_estimado = 0
    elif turno.estado == "esperando":
        anteriores = (
            db.query(Turno)
            .filter(
                Turno.operador_id == turno.operador_id,
                Turno.estado == "esperando",
                Turno.hora_entrada < turno.hora_entrada,
            )
            .count()
        )
        posicion = anteriores + 1

        config_servicio = next(
            (s for s in turno.operador.servicios if s.motivo == turno.motivo), None
        )
        duracion = parsear_duracion_minutos(
            config_servicio.tiempo_estimado if config_servicio else None
        )
        tiempo_estimado = posicion * duracion
    else:
        posicion = -1
        tiempo_estimado = 0

    return {
        "turno_id": turno_id,
        "codigo": turno.codigo,
        "estado": turno.estado,
        "posicion": posicion,
        "tiempo_estimado_minutos": tiempo_estimado,
    }


# ── SIGUIENTE TURNO — PROTEGIDO ───────────────────────────────────────────────

@router.post("/siguiente/{operador_id}")
async def siguiente_turno(
    operador_id: int,
    db: Session = Depends(get_db),
    operador_actual: Operador = Depends(require_operador),
):
    if operador_actual.rol != "admin" and operador_actual.id != operador_id:
        raise HTTPException(status_code=403, detail="No podés operar la cola de otro operador")

    activo = (
        db.query(Turno)
        .filter(
            Turno.operador_id == operador_id,
            Turno.estado.in_(["llamando", "atendiendo"])
        )
        .first()
    )
    if activo:
        raise HTTPException(status_code=400, detail="Ya hay un turno activo. Finalizalo primero.")

    siguiente = (
        db.query(Turno)
        .filter(Turno.operador_id == operador_id, Turno.estado == "esperando")
        .order_by(asc(Turno.hora_entrada))
        .first()
    )
    if not siguiente:
        raise HTTPException(status_code=404, detail="No hay turnos en espera.")

    siguiente.estado = "llamando"
    db.commit()
    db.refresh(siguiente)

    # Push aislado: si falla no rompe el endpoint
    if siguiente.push_token:
        try:
            enviar_push(
                siguiente.push_token,
                "¡Es tu turno!",
                "Por favor, acercate al puesto de atención."
            )
        except Exception as e:
            print(f"[WARN] Push falló para turno {siguiente.id}: {e}")

    await manager.broadcast(operador_id, {"evento": "siguiente_turno", "turno": siguiente.codigo})
    return siguiente


# ── PUSH TOKEN (cliente — SIN autenticación) ──────────────────────────────────

@router.patch("/{turno_id}/push_token")
async def actualizar_push_token(turno_id: int, data: dict, db: Session = Depends(get_db)):
    """Guarda el token de suscripción push generado por el navegador del cliente."""
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")

    turno.push_token = data.get("push_token")
    db.commit()
    return {"status": "token actualizado"}


# ── ATENDER — PROTEGIDO ───────────────────────────────────────────────────────

@router.patch("/{turno_id}/atender")
async def atender_turno(
    turno_id: int,
    db: Session = Depends(get_db),
    operador_actual: Operador = Depends(require_operador),
):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if operador_actual.rol != "admin" and operador_actual.id != turno.operador_id:
        raise HTTPException(status_code=403, detail="No podés atender turnos de otro operador")
    if turno.estado != "llamando":
        raise HTTPException(status_code=400, detail="El turno no está en estado 'llamando'")

    turno.estado = "atendiendo"
    turno.hora_atencion = datetime.utcnow()
    db.commit()
    db.refresh(turno)

    await manager.broadcast(turno.operador_id, {"evento": "turno_atendiendo", "turno": turno.codigo})
    return turno


# ── FINALIZAR — PROTEGIDO ─────────────────────────────────────────────────────

@router.patch("/{turno_id}/finalizar")
async def finalizar_turno(
    turno_id: int,
    db: Session = Depends(get_db),
    operador_actual: Operador = Depends(require_operador),
):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if operador_actual.rol != "admin" and operador_actual.id != turno.operador_id:
        raise HTTPException(status_code=403, detail="No podés finalizar turnos de otro operador")
    if turno.estado != "atendiendo":
        raise HTTPException(status_code=400, detail="El turno no está en estado 'atendiendo'")

    turno.estado = "atendido"
    turno.hora_finalizacion = datetime.utcnow()

    if turno.hora_atencion:
        delta = turno.hora_finalizacion - turno.hora_atencion
        turno.tiempo_servicio_segundos = int(delta.total_seconds())

    db.commit()
    db.refresh(turno)

    await manager.broadcast(turno.operador_id, {"evento": "turno_finalizado", "turno": turno.codigo})
    return turno


# ── CANCELAR — PROTEGIDO ──────────────────────────────────────────────────────

@router.patch("/{turno_id}/cancelar")
async def cancelar_turno(
    turno_id: int,
    db: Session = Depends(get_db),
    operador_actual: Operador = Depends(require_operador),
):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if operador_actual.rol != "admin" and operador_actual.id != turno.operador_id:
        raise HTTPException(status_code=403, detail="No podés cancelar turnos de otro operador")
    if turno.estado in ["atendido", "cancelado"]:
        raise HTTPException(status_code=400, detail="El turno ya está cerrado")

    turno.estado = "cancelado"
    db.commit()

    await manager.broadcast(turno.operador_id, {"evento": "turno_cancelado", "turno": turno.codigo})
    return {"mensaje": "Turno cancelado"}


# ── BUSCAR POR DNI (cliente — SIN autenticación) ──────────────────────────────

@router.get("/dni/{dni}/operador/{operador_id}")
def buscar_por_dni(dni: str, operador_id: int, db: Session = Depends(get_db)):
    turno = (
        db.query(Turno)
        .filter(
            Turno.dni_cliente == dni,
            Turno.operador_id == operador_id,
            Turno.estado.in_(["esperando", "llamando", "atendiendo"])
        )
        .order_by(Turno.hora_entrada.desc())
        .first()
    )
    if not turno:
        raise HTTPException(status_code=404, detail="No se encontró turno activo para ese DNI")
    return turno