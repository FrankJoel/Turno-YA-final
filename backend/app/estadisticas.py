# backend/app/estadisticas.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.turno import Turno
from app.models.operador import Operador
from datetime import datetime, timedelta, date

router = APIRouter(prefix="/estadisticas", tags=["estadisticas"])


def _rango(periodo: str):
    hoy = date.today()
    if periodo == "hoy":
        inicio = datetime.combine(hoy, datetime.min.time())
    elif periodo == "semana":
        inicio = datetime.combine(hoy - timedelta(days=7), datetime.min.time())
    elif periodo == "mes":
        inicio = datetime.combine(hoy - timedelta(days=30), datetime.min.time())
    else:
        inicio = datetime.combine(hoy, datetime.min.time())
    fin = datetime.utcnow()
    return inicio, fin


def _calcular(db: Session, establecimiento_id: int, periodo: str) -> dict:
    inicio, fin = _rango(periodo)

    # Operadores del establecimiento
    operadores = db.query(Operador).filter(
        Operador.establecimiento_id == establecimiento_id
    ).all()
    op_ids = [op.id for op in operadores]

    if not op_ids:
        return _vacio()

    # Turnos en el rango
    turnos = db.query(Turno).filter(
        Turno.operador_id.in_(op_ids),
        Turno.hora_entrada >= inicio,
        Turno.hora_entrada <= fin,
    ).all()

    atendidos  = [t for t in turnos if t.estado in ("atendiendo", "atendido")]
    cancelados = [t for t in turnos if t.estado == "cancelado"]
    en_espera  = [t for t in turnos if t.estado == "esperando"]

    # Motivos
    motivos: dict = {}
    for t in atendidos:
        motivos[t.motivo] = motivos.get(t.motivo, 0) + 1

    # Promedio de atención (diferencia entre hora_atencion y hora_entrada)
    tiempos = []
    for t in atendidos:
        if t.hora_atencion and t.hora_entrada:
            delta = (t.hora_atencion - t.hora_entrada).total_seconds() / 60
            if 0 < delta < 120:
                tiempos.append(delta)
    promedio = round(sum(tiempos) / len(tiempos)) if tiempos else 0

    # Hora pico: hora con más turnos creados
    horas: dict = {}
    for t in turnos:
        h = t.hora_entrada.strftime("%H:00") if t.hora_entrada else None
        if h:
            horas[h] = horas.get(h, 0) + 1
    hora_pico = max(horas, key=horas.get) if horas else "--"

    # Últimos atendidos (para tabla)
    ultimos = sorted(
        [t for t in atendidos if t.hora_atencion],
        key=lambda x: x.hora_atencion,
        reverse=True
    )[:10]

    ultimos_fmt = [
        {
            "codigo": t.codigo,
            "hora": t.hora_atencion.strftime("%H:%M") if t.hora_atencion else "--",
            "motivo": t.motivo,
        }
        for t in ultimos
    ]

    # Por operador
    por_operador = []
    for op in operadores:
        op_turnos    = [t for t in atendidos if t.operador_id == op.id]
        op_motivos   = {}
        for t in op_turnos:
            op_motivos[t.motivo] = op_motivos.get(t.motivo, 0) + 1
        op_ultimos = sorted(
            [t for t in op_turnos if t.hora_atencion],
            key=lambda x: x.hora_atencion, reverse=True
        )[:5]
        por_operador.append({
            "operador_id": op.id,
            "nombre": f"{op.nombre} {op.apellido}",
            "puesto": op.puesto,
            "atendidos": len(op_turnos),
            "motivos": op_motivos,
            "ultimos": [
                {"codigo": t.codigo, "hora": t.hora_atencion.strftime("%H:%M")}
                for t in op_ultimos
            ],
        })

    return {
        "total_atendidos":  len(atendidos),
        "total_cancelados": len(cancelados),
        "en_espera":        len(en_espera),
        "promedio_minutos": promedio,
        "hora_pico":        hora_pico,
        "motivos":          motivos,
        "ultimos":          ultimos_fmt,
        "por_operador":     por_operador,
    }


def _vacio():
    return {
        "total_atendidos": 0, "total_cancelados": 0,
        "en_espera": 0, "promedio_minutos": 0,
        "hora_pico": "--", "motivos": {}, "ultimos": [], "por_operador": [],
    }


@router.get("/{establecimiento_id}/hoy")
def estadisticas_hoy(establecimiento_id: int, db: Session = Depends(get_db)):
    return _calcular(db, establecimiento_id, "hoy")


@router.get("/{establecimiento_id}/semana")
def estadisticas_semana(establecimiento_id: int, db: Session = Depends(get_db)):
    return _calcular(db, establecimiento_id, "semana")


@router.get("/{establecimiento_id}/mes")
def estadisticas_mes(establecimiento_id: int, db: Session = Depends(get_db)):
    return _calcular(db, establecimiento_id, "mes")


@router.get("/{establecimiento_id}/operadores")
def estadisticas_operadores(establecimiento_id: int, db: Session = Depends(get_db)):
    data = _calcular(db, establecimiento_id, "hoy")
    return data.get("por_operador", [])
