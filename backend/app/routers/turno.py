# app/routers/turno.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import asc
from app.database import get_db
from app.models.turno import Turno
from app.models.operador import Operador
from app.schemas import turno as schemas
from app.websocket.manager import manager
from app.services.notificaciones import enviar_push  # <--- AGREGADO
from datetime import datetime, timedelta

router = APIRouter(prefix="/turnos", tags=["turnos"])


# ── HELPERS ────────────────────────────────────────────────────────────────────

def parsear_duracion_minutos(tiempo_estimado: str, default: int = 20) -> int:
    if not tiempo_estimado or not isinstance(tiempo_estimado, str): # Validación de nulidad
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


def generar_codigo_ticket(operador_id: int, db: Session) -> str:
    from datetime import date
    hoy = date.today()
    # Solo contamos los turnos de hoy para que el ticket reinicie a 001 cada día
    cantidad = db.query(Turno).filter(
        Turno.operador_id == operador_id,
        Turno.hora_entrada >= hoy
    ).count()
    return f"P{operador_id}-{cantidad + 1:03d}"


# ── CREAR TURNO (cliente desde QR) ────────────────────────────────────────────

@router.post("/", response_model=schemas.TurnoOut)
def crear_turno(payload: schemas.TurnoCreate, db: Session = Depends(get_db)):
    operador = db.query(Operador).filter(Operador.id == payload.operador_id).first()
    if not operador:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    #  VALIDACIÓN DE FILA CERRADA ---
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
        codigo=generar_codigo_ticket(payload.operador_id, db),
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

# ── COLA DE ESPERA (panel operador — lista derecha) ───────────────────────────

@router.get("/cola/{operador_id}")
def get_cola(operador_id: int, db: Session = Depends(get_db)):
    """Devuelve los turnos en estado 'esperando' de este operador, en orden."""
    turnos = (
        db.query(Turno)
        .filter(Turno.operador_id == operador_id, Turno.estado == "esperando")
        .order_by(asc(Turno.hora_entrada))
        .all()
    )
    return turnos


# ── ESTADO ACTUAL (quién está siendo llamado/atendido ahora) ──────────────────

@router.get("/estado_actual/{operador_id}")
def get_estado_actual(operador_id: int, db: Session = Depends(get_db)):
    """Devuelve el turno activo (llamando o atendiendo). Vacío si no hay ninguno."""
    turno = (
        db.query(Turno)
        .filter(
            Turno.operador_id == operador_id,
            Turno.estado.in_(["llamando", "atendiendo"])
        )
        .first()
    )
    return turno or {}


# ── POSICIÓN EN LA COLA (pantalla del cliente) ────────────────────────────────

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

        # ──  leer tiempo del servicio configurado ──
        config_servicio = next(
            (s for s in turno.operador.servicios if s.motivo == turno.motivo), None
        )
        duracion = parsear_duracion_minutos(
            config_servicio.tiempo_estimado if config_servicio else None
        )
        tiempo_estimado = posicion * duracion
        # ─────────────────────────────────────────────────────
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


# ── SIGUIENTE TURNO (operador llama al próximo) ───────────────────────────────

@router.post("/siguiente/{operador_id}")
async def siguiente_turno(operador_id: int, db: Session = Depends(get_db)):
    # No puede llamar si ya tiene uno activo
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

    # --- NOTIFICACIÓN PUSH (AGREGADO) ---
    if siguiente.push_token:
        enviar_push(
            siguiente.push_token, 
            "¡Es tu turno!", 
            f"Por favor, acércate al puesto de atención."
        )

    # Notificar por WebSocket a todos los conectados a este operador
    await manager.broadcast(operador_id, {"evento": "siguiente_turno", "turno": siguiente.codigo})

    return siguiente

@router.patch("/{turno_id}/push_token")
async def actualizar_push_token(turno_id: int, data: dict, db: Session = Depends(get_db)):
    """
    Guarda el token de suscripción push generado por el navegador del cliente.
    """
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    
    # El data debe traer {'push_token': 'json_del_navegador'}
    turno.push_token = data.get("push_token")
    db.commit()
    return {"status": "token actualizado"}

# ── ATENDER (confirma que el cliente llegó) ───────────────────────────────────

@router.patch("/{turno_id}/atender")
async def atender_turno(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if turno.estado != "llamando":
        raise HTTPException(status_code=400, detail="El turno no está en estado 'llamando'")

    turno.estado = "atendiendo"
    turno.hora_atencion = datetime.utcnow()
    db.commit()
    db.refresh(turno)

    await manager.broadcast(turno.operador_id, {"evento": "turno_atendiendo", "turno": turno.codigo})
    return turno


# ── FINALIZAR ─────────────────────────────────────────────────────────────────

@router.patch("/{turno_id}/finalizar")
async def finalizar_turno(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
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


# ── CANCELAR ──────────────────────────────────────────────────────────────────

@router.patch("/{turno_id}/cancelar")
async def cancelar_turno(turno_id: int, db: Session = Depends(get_db)):
    turno = db.query(Turno).filter(Turno.id == turno_id).first()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if turno.estado in ["atendido", "cancelado"]:
        raise HTTPException(status_code=400, detail="El turno ya está cerrado")

    turno.estado = "cancelado"
    db.commit()

    await manager.broadcast(turno.operador_id, {"evento": "turno_cancelado", "turno": turno.codigo})
    return {"mensaje": "Turno cancelado"}


# ── BUSCAR POR DNI (para reingresar a la cola) ────────────────────────────────

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