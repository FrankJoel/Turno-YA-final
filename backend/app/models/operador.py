from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Operador(Base):
    __tablename__ = "operadores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    apellido = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    dni = Column(String, nullable=False)
    puesto = Column(String, nullable=False)
    rol = Column(String, default="operador")  # operador | admin
    fila_abierta = Column(Boolean, default=True)
    activo = Column(Boolean, default=True)
    establecimiento_id = Column(Integer, ForeignKey("establecimientos.id"))
    establecimiento = relationship("Establecimiento")
    turnos = relationship("Turno", back_populates="operador")