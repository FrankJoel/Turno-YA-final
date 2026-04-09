from sqlalchemy import Column, Integer, String, Boolean, Float
from app.database import Base

class Establecimiento(Base):
    __tablename__ = "establecimientos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    rubro = Column(String, nullable=False)
    tolerancia_minutos = Column(Integer, default=10)
    activo = Column(Boolean, default=True)