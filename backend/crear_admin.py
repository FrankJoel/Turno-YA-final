import sys, os
sys.path.append(os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app.models.establecimiento import Establecimiento
from app.models.turno import Turno
from app.models.operador import Operador
from app.services.auth import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

est = db.query(Establecimiento).first()
if not est:
    est = Establecimiento(nombre="Mi Peluquería", rubro="Peluquería", tolerancia_minutos=10, activo=True)
    db.add(est)
    db.commit()
    db.refresh(est)
    print(f"✓ Establecimiento creado: {est.nombre} (id={est.id})")
else:
    print(f"✓ Establecimiento ya existe: {est.nombre} (id={est.id})")

admin = db.query(Operador).filter(Operador.username == "admin").first()
if not admin:
    admin = Operador(
        nombre="Admin",
        apellido="TurnoYa",
        username="admin",
        password_hash=hash_password("admin1234"),
        dni="00000000",
        puesto="ADMIN",   # puesto especial, no compite con operadores
        rol="admin",
        establecimiento_id=est.id,
        activo=True,
        fila_abierta=False  # el admin no atiende turnos
    )
    db.add(admin)
    db.commit()
    print("✓ Admin creado — usuario: admin / contraseña: admin1234")
else:
    print(f"✓ Admin ya existe (username: {admin.username})")

db.close()
print("\n¡Listo! Podés iniciar sesión en loginStaff.html")