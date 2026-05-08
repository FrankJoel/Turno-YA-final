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
    
    # Estados: esperando | llamando | atendiendo | atendido | cancelado
    estado = Column(String, default="esperando")  
    
    push_token = Column(String, nullable=True)
    
    # --- Control de Tiempos ---
    hora_entrada = Column(DateTime, default=datetime.utcnow) # Registro al sacar turno
    hora_atencion = Column(DateTime, nullable=True)          # Registro al presionar "Atender"
    hora_finalizacion = Column(DateTime, nullable=True)      # Registro al presionar "Finalizar"
    hora_finalizacion_estimada = Column(DateTime, nullable=True)
    # Almacenamos el resultado final en segundos para facilitar estadísticas luego
    tiempo_servicio_segundos = Column(Integer, nullable=True) 

    # --- Relaciones ---
    operador_id = Column(Integer, ForeignKey("operadores.id"))
    push_token = Column(String, nullable=True)
    operador = relationship("Operador", back_populates="turnos")