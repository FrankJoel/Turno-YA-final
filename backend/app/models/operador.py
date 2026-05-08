from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class OperadorServicio(Base):
    __tablename__ = "operador_servicios"

    id = Column(Integer, primary_key=True, index=True)
    operador_id = Column(Integer, ForeignKey("operadores.id"))
    motivo = Column(String, nullable=False)
    tiempo_estimado = Column(String, nullable=False) # Guardamos "00:30", "01:00", etc.

    operador = relationship("Operador", back_populates="servicios")

class Operador(Base):
    __tablename__ = "operadores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    apellido = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    dni = Column(String, nullable=False)
    puesto = Column(String, nullable=False)
    rol = Column(String, default="operador")
    fila_abierta = Column(Boolean, default=True)
    activo = Column(Boolean, default=True)
    
    establecimiento_id = Column(Integer, ForeignKey("establecimientos.id"))
    establecimiento = relationship("Establecimiento")
    
    # RELACIONES ACTUALIZADAS
    turnos = relationship("Turno", back_populates="operador")
    servicios = relationship("OperadorServicio", back_populates="operador", cascade="all, delete-orphan")