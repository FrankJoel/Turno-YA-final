// js/gestion-turno-cliente.js
import api from './api.js';

// Capturamos los datos guardados por registro-cliente.js
const turnoId     = parseInt(localStorage.getItem('cliente_turno_id') || '0');
const turnoCod    = localStorage.getItem('cliente_turno_cod') || '--';
const nombre      = localStorage.getItem('cliente_nombre') || 'Cliente';
const hora        = localStorage.getItem('cliente_hora') || '--:--';
const operadorId  = parseInt(localStorage.getItem('cliente_operador_id') || '0');

let yaSonóAlerta = false;
let yaVibroProximidad = false; // Flag para no vibrar repetidamente en pos === 1
let tiempoRestanteLocal = 0;
let intervaloCuentaRegresiva = null;
let yaFinalizado = false;
let yaNotificóProximidad = false;

function init() {

  // Si no hay ID de turno, el cliente no debería estar acá
  if (!turnoId || turnoId === 0) {
    window.location.href = 'index.html';
    return;
  }

  // Llenado inicial de la interfaz
  setText('display-turno', turnoCod);
  setText('hora-registro', hora);
  setText('saludo-nombre', nombre);
  setText('user-initials', nombre.charAt(0).toUpperCase());

  // Primera carga de posición
  actualizarPosicion();
  pedirPermisoNotificaciones();

  // Polling cada 5 segundos — reemplaza al WebSocket que Render no soporta en plan gratuito
  setInterval(actualizarPosicion, 5000);

} 

async function actualizarPosicion() {
  try {
    const data = await api.getPosicion(turnoId);

    // Si el turno ya fue atendido o cancelado, mostramos la pantalla de finalizado
    if (data.estado === 'atendido' || data.estado === 'cancelado') {
      mostrarFinalizado();
      return;
    }

    const pos = Math.max(0, data.posicion);
    const espera = data.tiempo_estimado_minutos || (pos * 15);
    const codigoAtendiendo = data.codigo_atendiendo || '--';
    const nombreOp = data.nombre_operador || '';

    // Guardamos el tiempo para la cuenta regresiva local
    tiempoRestanteLocal = espera;

    setText('llamando-ahora', codigoAtendiendo);
    setText('nombre-peluquero', nombreOp ? `Con: ${nombreOp}` : "");

    const alertaProximidad = document.getElementById('alerta-proximidad');

    if (pos === 1) {
      // El cliente es el próximo — mostramos el banner llamativo
      alertaProximidad?.classList.remove('hidden');

      // Notificación del sistema (si el usuario dio permiso)
      if (!yaNotificóProximidad) {
        notificarProximidad();
        yaNotificóProximidad = true;
      }

      // Vibración en Android — solo la primera vez que llega a pos === 1
      if (!yaVibroProximidad) {
        if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
        yaVibroProximidad = true;
      }
    } else {
      // Ya no es el próximo — ocultamos el banner y reseteamos el flag
      alertaProximidad?.classList.add('hidden');
      yaVibroProximidad = false;
      yaNotificóProximidad = false;
    }

    if (pos === 0) {
      // --- LÓGICA DE ATENDIENDO ---
      detenerCronometroLocal();
      setText('tu-posicion', '¡Es tu turno!');
      setText('espera-min', '¡PASÁ!');
      setText('hora-estimada', 'Atención en curso');
      setBarWidth('progress-bar', 100);

      const bar = document.getElementById('progress-bar');
      bar?.classList.remove('bg-primary');
      bar?.classList.add('bg-green-500');

      if (!yaSonóAlerta) {
        reproducirSonido();
        // Vibración más intensa al ser llamado
        if (navigator.vibrate) navigator.vibrate([600, 200, 600, 200, 600]);
        yaSonóAlerta = true;
      }
    } else {
      // --- LÓGICA DE ESPERA + CUENTA REGRESIVA ---
      setText('tu-posicion', pos);
      yaSonóAlerta = false;

      // Actualizamos textos con minutos y hora estimada calculada
      actualizarTextosTiempo(tiempoRestanteLocal);

      // Iniciamos el segundero local para que baje minuto a minuto
      iniciarCronometroLocal(pos);

      // Progreso base según posición
      const progresoBase = Math.max(5, Math.min(95, 100 - (pos * 12)));
      setBarWidth('progress-bar', progresoBase);
    }

  } catch (err) {
    // Solo mostramos finalizado si es un error 404 (turno no existe)
    // Si es un error de red/timeout, lo ignoramos 
    if (err.message && err.message.includes('404')) {
      mostrarFinalizado();
    } else {
      console.warn('Error de red al consultar posición, reintentando...', err.message);
    }
  }
}

function mostrarFinalizado() {
  if (yaFinalizado) return; // Evita que se ejecute más de una vez
  yaFinalizado = true;

  const modal = document.getElementById('modal-finalizado');
  if (modal) modal.classList.remove('hidden');

  // Limpiamos la sesión del cliente, pero no redirigimos
    limpiarSesionCliente();
}

async function cancelarTurno() {
  if (!confirm('¿Seguro que querés cancelar tu turno?')) return;
  try {
    await api.cancelarTurno(turnoId);
  } catch (e) {
    console.warn('Error al cancelar:', e.message);
  } finally {
    limpiarSesionCliente();
    mostrarFinalizado();
  }
}

function limpiarSesionCliente() {
  ['cliente_turno_id', 'cliente_turno_cod', 'cliente_nombre', 'cliente_hora', 'cliente_operador_id']
    .forEach(k => localStorage.removeItem(k));
}

// --- HELPERS DE UI ---

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

function setBarWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${pct}%`;
}

function reproducirSonido() {
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(e => console.log("Audio bloqueado por el navegador"));
  } catch {}
}

function iniciarCronometroLocal(posicionActual) {
  // Limpiamos cualquier intervalo previo para no duplicar
  if (intervaloCuentaRegresiva) clearInterval(intervaloCuentaRegresiva);

  intervaloCuentaRegresiva = setInterval(() => {
    if (tiempoRestanteLocal > 1) {
      tiempoRestanteLocal -= 1;
      // Actualizamos tanto los minutos como la hora estimada cada minuto
      actualizarTextosTiempo(tiempoRestanteLocal);

      // Hacemos que la barra avance un 0.5% cada minuto
      const bar = document.getElementById('progress-bar');
      if (bar) {
        const currentWidth = parseFloat(bar.style.width) || 5;
        if (currentWidth < 98) {
          bar.style.width = (currentWidth + 0.5) + '%';
        }
      }
    }
  }, 60000); // 60000ms = 1 minuto
}

function detenerCronometroLocal() {
  if (intervaloCuentaRegresiva) clearInterval(intervaloCuentaRegresiva);
}

// Suma minutos a la hora actual y devuelve formato "HH:MM"
function calcularHoraEstimada(minutosEspera) {
  const ahora = new Date();
  ahora.setMinutes(ahora.getMinutes() + minutosEspera);
  const horas = String(ahora.getHours()).padStart(2, '0');
  const minutos = String(ahora.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}

// Actualiza los textos de tiempo en pantalla:
// - espera-min: muestra los minutos restantes 
// - hora-estimada: muestra la hora exacta calculada 
function actualizarTextosTiempo(min) {
  setText('espera-min', `${min} min`);
  const horaEstimada = calcularHoraEstimada(min);
  setText('hora-estimada', `~${horaEstimada} hs`);
}

async function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function notificarProximidad() {
  if (Notification.permission !== 'granted') return;
  new Notification('¡TurnoYa - Casi es tu turno!', {
    body: 'Sos el próximo en la fila. Acercate al local.',
    icon: '/static/img/icon.png'
  });
}

// Exponemos la función al HTML para el onclick
window.cancelarTurno = cancelarTurno;
window.addEventListener('DOMContentLoaded', init);