// js/gestion-turno-cliente.js
import api from './api.js';

// Capturamos los datos guardados por registro-cliente.js
const turnoId     = parseInt(localStorage.getItem('cliente_turno_id') || '0');
const turnoCod    = localStorage.getItem('cliente_turno_cod') || '--';
const nombre      = localStorage.getItem('cliente_nombre') || 'Cliente';
const hora        = localStorage.getItem('cliente_hora') || '--:--';
const operadorId  = parseInt(localStorage.getItem('cliente_operador_id') || '0');

let wsConexion = null;
let yaSonóAlerta = false; 
let tiempoRestanteLocal = 0; 
let intervaloCuentaRegresiva = null;
let yaFinalizado = false;

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

  // Refresco de seguridad cada 15 segundos (por si falla el WS)
  setInterval(actualizarPosicion, 15000);

  // Conexión al WebSocket usando el ID del operador que lo atiende
  if (operadorId > 0) {
    wsConexion = api.conectarWS(operadorId, (data) => {
      // Si el peluquero realiza cualquier acción, refrescamos la posición
      const eventosRefresco = ['siguiente_turno', 'turno_atendiendo', 'turno_cancelado', 'turno_finalizado'];
      if (eventosRefresco.includes(data.evento)) {
        actualizarPosicion();
      }
    });
  }
}

async function actualizarPosicion() {
  try {
    const data = await api.getPosicion(turnoId);
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
      alertaProximidad?.classList.remove('hidden');
      notificarProximidad();
    } else {
      alertaProximidad?.classList.add('hidden');
    }

    if (pos === 0) {
      // ---  LÓGICA DE ATENDIENDO ---
      detenerCronometroLocal(); // Paramos la cuenta si ya pasó
      setText('tu-posicion', '¡Es tu turno!');
      setText('espera-min', '¡PASÁ!');
      setText('hora-estimada', 'Atención en curso');
      setBarWidth('progress-bar', 100);
      
      const bar = document.getElementById('progress-bar');
      bar?.classList.remove('bg-primary');
      bar?.classList.add('bg-green-500');
      
      if (!yaSonóAlerta) {
        reproducirSonido();
        yaSonóAlerta = true; 
      }
    } else {
      // --- LÓGICA DE ESPERA + CUENTA REGRESIVA ---
      setText('tu-posicion', pos);
      yaSonóAlerta = false; 

      // Actualizamos textos iniciales
      actualizarTextosTiempo(tiempoRestanteLocal);
      
      // Iniciamos el segundero local para que baje minuto a minuto
      iniciarCronometroLocal(pos);

      // Progreso base según posición
      const progresoBase = Math.max(5, Math.min(95, 100 - (pos * 12)));
      setBarWidth('progress-bar', progresoBase);
    }

  } catch (err) {
    console.warn('Turno finalizado o no encontrado');
    mostrarFinalizado();
  }
}

function mostrarFinalizado() {
    if (yaFinalizado) return; // ← evita que se ejecute más de una vez
    yaFinalizado = true;

    const modal = document.getElementById('modal-finalizado');
    if (modal) modal.classList.remove('hidden');

    setTimeout(() => {
        limpiarSesionCliente();
        window.location.href = 'index.html';
    }, 120000);
}
async function cancelarTurno() {
  if (!confirm('¿Seguro que querés cancelar tu turno?')) return;
  try {
    await api.cancelarTurno(turnoId);
  } catch (e) {
    console.warn('Error al cancelar:', e.message);
  } finally {
    limpiarSesionCliente();
    window.location.href = 'index.html';
  }
}

function limpiarSesionCliente() {
  ['cliente_turno_id','cliente_turno_cod','cliente_nombre','cliente_hora','cliente_operador_id']
    .forEach(k => localStorage.removeItem(k));
}

// Helpers de UI
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
      actualizarTextosTiempo(tiempoRestanteLocal);

      // Hacemos que la barra avance un 0.5% cada minuto 
      // para que el cliente vea que el sistema está "vivo"
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

function actualizarTextosTiempo(min) {
  setText('espera-min', `${min} min`);
  setText('hora-estimada', `~${min} min`);
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