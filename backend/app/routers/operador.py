# app/routers/operador.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.operador import Operador, OperadorServicio
from app.schemas.operador import OperadorCreate, OperadorOut
from app.services.auth import hash_password, require_admin, require_operador
import re, qrcode, io

router = APIRouter(prefix="/operadores", tags=["operadores"])


def generar_username(nombre: str, apellido: str, db: Session) -> str:
    base = re.sub(r'[^a-z0-9]', '', f"{nombre}{apellido}".lower())
    username, contador = base, 1
    while db.query(Operador).filter(Operador.username == username).first():
        username = f"{base}{contador}"
        contador += 1
    return username


# ── CREAR OPERADOR — solo admin ───────────────────────────────────────────────

@router.post("/", response_model=OperadorOut)
def crear_operador(
    data: OperadorCreate,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
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


# ── ACTUALIZAR OPERADOR — solo admin ──────────────────────────────────────────

@router.put("/{operador_id}", response_model=OperadorOut)
def actualizar_operador(
    operador_id: int,
    data: OperadorCreate,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
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


# ── LISTAR OPERADORES — solo admin ────────────────────────────────────────────

@router.get("/", response_model=list[OperadorOut])
def listar_operadores(
    establecimiento_id: int,
    db: Session = Depends(get_db),
):
    return db.query(Operador).options(
        joinedload(Operador.servicios)
    ).filter(
        Operador.establecimiento_id == establecimiento_id
    ).all()


# ── OBTENER OPERADOR INDIVIDUAL — libre (lo usa el cliente al escanear el QR) ─

@router.get("/{operador_id}", response_model=OperadorOut)
def obtener_operador_individual(operador_id: int, db: Session = Depends(get_db)):
    operador = db.query(Operador).options(
        joinedload(Operador.servicios)
    ).filter(Operador.id == operador_id).first()

    if not operador:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    return operador


# ── TOGGLE FILA — operador sobre su propia fila, admin sobre cualquiera ───────

@router.patch("/{operador_id}/fila")
def toggle_fila(
    operador_id: int,
    db: Session = Depends(get_db),
    operador_actual: Operador = Depends(require_operador),
):
    if operador_actual.rol != "admin" and operador_actual.id != operador_id:
        raise HTTPException(status_code=403, detail="Solo podés modificar tu propia fila")

    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    op.fila_abierta = not op.fila_abierta
    db.commit()
    return {"fila_abierta": op.fila_abierta}


# ── TOGGLE ACTIVO — solo admin ────────────────────────────────────────────────

@router.patch("/{operador_id}/toggle")
def toggle_activo(
    operador_id: int,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    op.activo = not op.activo
    db.commit()
    return {"activo": op.activo}


# ── ELIMINAR OPERADOR — solo admin ────────────────────────────────────────────

@router.delete("/{operador_id}")
def eliminar_operador(
    operador_id: int,
    db: Session = Depends(get_db),
    _: Operador = Depends(require_admin),
):
    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    try:
        db.delete(op)
        db.commit()
        return {"message": "Operador eliminado correctamente"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar: {str(e)}")


# ── QR — operador ve su propio QR, admin ve cualquiera ────────────────────────

@router.get("/{operador_id}/qr")
def obtener_qr(
    operador_id: int,
    base_url: str,
    db: Session = Depends(get_db),
    operador_actual: Operador = Depends(require_operador),
):
    if operador_actual.rol != "admin" and operador_actual.id != operador_id:
        raise HTTPException(status_code=403, detail="Solo podés ver tu propio QR")

    op = db.query(Operador).filter(Operador.id == operador_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    base_limpia = base_url.strip().split('?')[0].rstrip("/")
    if not base_limpia.lower().endswith("index.html"):
        base_limpia = f"{base_limpia}/index.html"
    url_final = f"{base_limpia}?op={operador_id}&est={op.establecimiento_id}"

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(url_final)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")