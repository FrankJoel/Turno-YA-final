# app/routers/estadisticas.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.turno import Turno
from app.models.operador import Operador
from app.services.auth import require_operador, require_admin
from datetime import datetime, timedelta, date

router = APIRouter(prefix="/estadisticas", tags=["estadisticas"])


# ── HELPER ────────────────────────────────────────────────────────────────────

def calcular_metricas(turnos):
    atendidos  = [t for t in turnos if t.estado == "atendido"]
    cancelados = [t for t in turnos if t.estado == "cancelado"]

    tiempos = [
        (t.hora_atencion - t.hora_entrada).seconds // 60
        for t in atendidos if t.hora_atencion
    ]
    prom = round(sum(tiempos) / len(tiempos)) if tiempos else 0

    motivos = {}
    for t in atendidos:
        motivos[t.motivo] = motivos.get(t.motivo, 0) + 1

    # ── HORA PICO ──────────────────────────────────────────────────────────
    conteo_horas = {}
    for t in atendidos:
        if t.hora_atencion:
            hora = t.hora_atencion.strftime("%H:00")
            conteo_horas[hora] = conteo_horas.get(hora, 0) + 1
    hora_pico = max(conteo_horas, key=conteo_horas.get) if conteo_horas else "--"
    # ───────────────────────────────────────────────────────────────────────

    atendidos_sorted = sorted(
        atendidos,
        key=lambda x: x.hora_atencion or x.hora_entrada,
        reverse=True
    )[:12]

    ultimos = [
        {
            "codigo": t.codigo,
            "motivo": t.motivo,
            "hora": t.hora_atencion.strftime("%H:%M") if t.hora_atencion else "--:--"
        }
        for t in atendidos_sorted
    ]

    return {
        "atendidos":        len(atendidos),
        "cancelados":       len(cancelados),
        "promedio_minutos": prom,
        "motivos":          motivos,
        "ultimos":          ultimos,
        "hora_pico":        hora_pico,   # ← NUEVO
    }


# ── ESTADÍSTICAS DEL ESTABLECIMIENTO — solo admin ─────────────────────────────

@router.get("/{establecimiento_id}/hoy")
def estadisticas_hoy(
    establecimiento_id: int,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    hoy = datetime.utcnow().date()
    ids = [o.id for o in db.query(Operador).filter(Operador.establecimiento_id == establecimiento_id).all()]

    turnos = db.query(Turno).filter(
        Turno.operador_id.in_(ids),
        func.date(Turno.hora_entrada) == hoy
    ).all()

    return calcular_metricas(turnos)


@router.get("/{establecimiento_id}/semana")
def estadisticas_semana(
    establecimiento_id: int,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    hace_7 = datetime.utcnow() - timedelta(days=7)
    ids = [o.id for o in db.query(Operador).filter(Operador.establecimiento_id == establecimiento_id).all()]

    turnos = db.query(Turno).filter(
        Turno.operador_id.in_(ids),
        Turno.hora_entrada >= hace_7
    ).all()

    return calcular_metricas(turnos)


@router.get("/{establecimiento_id}/mes")
def estadisticas_mes(
    establecimiento_id: int,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    hace_30 = datetime.utcnow() - timedelta(days=30)
    ids = [o.id for o in db.query(Operador).filter(Operador.establecimiento_id == establecimiento_id).all()]

    turnos = db.query(Turno).filter(
        Turno.operador_id.in_(ids),
        Turno.hora_entrada >= hace_30
    ).all()

    return calcular_metricas(turnos)


@router.get("/{establecimiento_id}/operadores")
def estadisticas_operadores(
    establecimiento_id: int,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    hoy = datetime.utcnow().date()
    operadores = db.query(Operador).filter(Operador.establecimiento_id == establecimiento_id).all()

    resultado = []
    for op in operadores:
        turnos = db.query(Turno).filter(
            Turno.operador_id == op.id,
            func.date(Turno.hora_entrada) == hoy,
            Turno.estado == "atendido"
        ).all()

        tiempos = [
            (t.hora_atencion - t.hora_entrada).seconds // 60
            for t in turnos if t.hora_atencion
        ]

        prom = round(sum(tiempos) / len(tiempos)) if tiempos else 0

        resultado.append({
            "operador": f"{op.nombre} {op.apellido}",
            "puesto": op.puesto,
            "atendidos": len(turnos),
            "promedio_minutos": prom,
            "fila_abierta": op.fila_abierta,
        })

    return resultado


# ── ESTADÍSTICAS INDIVIDUALES — operador ve las suyas, admin ve cualquiera ────

@router.get("/operador/{operador_id}/hoy")
def estadisticas_individual_hoy(
    operador_id: int,
    db: Session = Depends(get_db),
    operador_actual: Operador = Depends(require_operador),
):
    if operador_actual.rol != "admin" and operador_actual.id != operador_id:
        raise HTTPException(status_code=403, detail="Solo podés ver tus propias estadísticas")

    hoy = datetime.utcnow().date()
    turnos = db.query(Turno).filter(
        Turno.operador_id == operador_id,
        func.date(Turno.hora_entrada) == hoy
    ).all()

    return calcular_metricas(turnos)