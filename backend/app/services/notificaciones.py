import os
import json
from pywebpush import webpush, WebPushException
from dotenv import load_dotenv

load_dotenv()

# Configuración de claves VAPID 
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_CLAIMS = {
    "sub": f"mailto:{os.getenv('ADMIN_EMAIL', 'admin@turnoya.com')}"
}

def enviar_push(push_token_json: str, titulo: str, cuerpo: str):
    """
    Envía una notificación push a un cliente específico utilizando su token.
   
    """
    if not push_token_json:
        return False

    try:
        # El push_token se almacena como un string JSON en la DB
        subscription_info = json.loads(push_token_json)

        webpush(
            subscription_info=subscription_info,
            data=json.dumps({
                "title": titulo,
                "body": cuerpo,
                "icon": "/static/img/icon.png", 
                "badge": "/static/img/badge.png"
            }),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        return True

    except WebPushException as ex:
        print(f"Error enviando push: {ex}")
        # Si el token ya no es válido, podrías marcarlo para limpieza
        return False
    except Exception as e:
        print(f"Error inesperado en notificaciones: {e}")
        return False