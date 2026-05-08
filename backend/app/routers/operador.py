# app/routers/operador.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.operador import Operador, OperadorServicio 
from app.schemas.operador import OperadorCreate, OperadorOut
from app.services.auth import hash_password
import re, qrcode, io

router = APIRouter(prefix="/operadores", tags=["operadores"])

def generar_username(nombre: str, apellido: str, db: Session) -> str:
    base = re.sub(r'[^a-z0-9]', '', f"{nombre}{apellido}".lower())
    username, contador = base, 1
    while db.query(Operador).filter(Operador.username == username).first():
        username = f"{base}{contador}"
        contador += 1
    return username

@router.post("/", response_model=OperadorOut)
def crear_operador(data: OperadorCreate, db: Session = Depends(get_db)):
    username      = generar_username(data.nombre, data.apellido, db)
    password_temp = f"{data.nombre.lower()}{data.dni[-4:]}"
    
    operador = Operador(
        nombre=data.nombre, 
        apellido=data.apellido,
        username=username, 
        password_hash=hash_password(password_temp),
        dni=data.dni, 
        puesto=data.puesto, 
        rol=data.rol,
        establecimiento_id=data.establecimiento_id
    )
    db.add(operador)
    
    try:
        db.flush()
        if hasattr(data, 'servicios') and data.servicios:
            for s in data.servicios:
                db.add(OperadorServicio(
                    operador_id=operador.id,
                    motivo=s.motivo,
                    tiempo_estimado=s.tiempo_estimado
                ))
        db.commit()
        db.refresh(operador)
        return operador
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al crear operador: {str(e)}")


@router.put("/{operador_id}", response_model=OperadorOut)
def actualizar_operador(operador_id: int, data: OperadorCreate, db: Session = Depends(get_db)):
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    op.nombre   = data.nombre
    op.apellido = data.apellido
    op.dni      = data.dni
    op.puesto   = data.puesto
    op.rol      = data.rol

    for s in op.servicios:
        db.delete(s)
    db.flush()

    for s in (data.servicios or []):
        db.add(OperadorServicio(
            operador_id=op.id,
            motivo=s.motivo,
            tiempo_estimado=s.tiempo_estimado
        ))

    db.commit()
    db.refresh(op)
    return op


@router.get("/", response_model=list[OperadorOut])
def listar_operadores(establecimiento_id: int, db: Session = Depends(get_db)):
    return db.query(Operador).filter(
        Operador.establecimiento_id == establecimiento_id
    ).all()


@router.patch("/{operador_id}/fila")
def toggle_fila(operador_id: int, db: Session = Depends(get_db)):
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    op.fila_abierta = not op.fila_abierta
    db.commit()
    return {"fila_abierta": op.fila_abierta}


@router.patch("/{operador_id}/toggle")
def toggle_activo(operador_id: int, db: Session = Depends(get_db)):
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    op.activo = not op.activo
    db.commit()
    return {"activo": op.activo}


@router.delete("/{operador_id}")
def eliminar_operador(operador_id: int, db: Session = Depends(get_db)):
    #Buscar al operador
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    
    try:
     #Ordenar el borrado
        db.delete(op)
        # 3. CONFIRMAR 
        db.commit()
        return {"message": "Operador eliminado correctamente"}
    except Exception as e:
        db.rollback() #  deshace para no romper la base
        raise HTTPException(status_code=500, detail=f"Error al eliminar: {str(e)}")
    
@router.get("/{operador_id}/qr")
def obtener_qr(operador_id: int, base_url: str, db: Session = Depends(get_db)):
    # Esta línea debe tener exactamente 4 espacios (o 1 tabulación)
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    
    url_final = f"{base_url}?op={operador_id}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(url_final)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    
    return StreamingResponse(buf, media_type="image/png")