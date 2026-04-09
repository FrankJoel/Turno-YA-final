from sqlalchemy.orm import Session
from app.models.turno import Turno
from app.models.operador import Operador
from datetime import datetime

def generar_codigo(operador: Operador, db: Session) -> str:
    puesto = operador.puesto.upper()
    hoy = datetime.utcnow().date()
    cantidad = db.query(Turno).filter(
        Turno.operador_id == operador.id,
        Turno.hora_entrada >= datetime.combine(hoy, datetime.min.time())
    ).count()
    numero = str(cantidad + 1).zfill(3)
    return f"{puesto}-{numero}"

def get_turno_activo_por_dni(dni: str, operador_id: int, db: Session):
    return db.query(Turno).filter(
        Turno.dni_cliente == dni,
        Turno.operador_id == operador_id,
        Turno.estado == "esperando"
    ).first()

def get_posicion_en_cola(turno: Turno, db: Session) -> int:
    return db.query(Turno).filter(
        Turno.operador_id == turno.operador_id,
        Turno.estado == "esperando",
        Turno.id < turno.id
    ).count()