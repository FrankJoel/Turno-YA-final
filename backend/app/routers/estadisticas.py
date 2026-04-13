from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.turno import Turno
from app.models.operador import Operador
from datetime import datetime, timedelta, date

router = APIRouter(prefix="/estadisticas", tags=["estadisticas"])

# --- FUNCIÓN AUXILIAR PARA NO REPETIR LÓGICA ---
def calcular_metricas(turnos):
    atendidos = [t for t in turnos if t.estado == "atendido"]
    cancelados = [t for t in turnos if t.estado == "cancelado"]
    
    tiempos = [
        (t.hora_atencion - t.hora_entrada).seconds // 60
        for t in atendidos if t.hora_atencion
    ]
    
    prom = round(sum(tiempos) / len(tiempos)) if tiempos else 0
    
    motivos = {}
    for t in atendidos:
        motivos[t.motivo] = motivos.get(t.motivo, 0) + 1
        
    return {
        "atendidos": len(atendidos),
        "cancelados": len(cancelados),
        "promedio_minutos": prom,
        "motivos": motivos
    }

# --- ENDPOINTS ---

@router.get("/{establecimiento_id}/hoy")
def estadisticas_hoy(establecimiento_id: int, db: Session = Depends(get_db)):
    hoy = datetime.utcnow().date()
    operadores = db.query(Operador).filter(Operador.establecimiento_id == establecimiento_id).all()
    ids = [o.id for o in operadores]
    
    turnos = db.query(Turno).filter(
        Turno.operador_id.in_(ids),
        func.date(Turno.hora_entrada) == hoy
    ).all()
    
    return calcular_metricas(turnos)

@router.get("/{establecimiento_id}/semana")
def estadisticas_semana(establecimiento_id: int, db: Session = Depends(get_db)):
    hace_7 = datetime.utcnow() - timedelta(days=7)
    operadores = db.query(Operador).filter(Operador.establecimiento_id == establecimiento_id).all()
    ids = [o.id for o in operadores]
    
    turnos = db.query(Turno).filter(
        Turno.operador_id.in_(ids),
        Turno.hora_entrada >= hace_7
    ).all()
    
    return calcular_metricas(turnos)

@router.get("/{establecimiento_id}/mes")
def estadisticas_mes(establecimiento_id: int, db: Session = Depends(get_db)):
    hace_30 = datetime.utcnow() - timedelta(days=30)
    operadores = db.query(Operador).filter(Operador.establecimiento_id == establecimiento_id).all()
    ids = [o.id for o in operadores]
    
    turnos = db.query(Turno).filter(
        Turno.operador_id.in_(ids),
        Turno.hora_entrada >= hace_30
    ).all()
    
    return calcular_metricas(turnos)

@router.get("/{establecimiento_id}/operadores")
def estadisticas_operadores(establecimiento_id: int, db: Session = Depends(get_db)):
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
            "fila_abierta": op.fila_abierta
        })
    return resultado