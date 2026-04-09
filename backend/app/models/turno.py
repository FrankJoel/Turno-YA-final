from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime

class Turno(Base):
    __tablename__ = "turnos"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String, nullable=False)
    dni_cliente = Column(String, nullable=False)
    nombre_cliente = Column(String, nullable=False)
    motivo = Column(String, nullable=False)
    estado = Column(String, default="esperando")  # esperando | atendiendo | atendido | cancelado
    push_token = Column(String, nullable=True)
    hora_entrada = Column(DateTime, default=datetime.utcnow)
    hora_atencion = Column(DateTime, nullable=True)
    operador_id = Column(Integer, ForeignKey("operadores.id"))
    operador = relationship("Operador", back_populates="turnos")