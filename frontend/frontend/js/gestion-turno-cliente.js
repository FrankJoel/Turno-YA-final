// js/gestion-turno-cliente.js
import api from './api.js';

const turnoId     = parseInt(localStorage.getItem('cliente_turno_id') || '0');
const turnoCod    = localStorage.getItem('cliente_turno_cod') || '--';
const nombre      = localStorage.getItem('cliente_nombre') || 'Cliente';
const hora        = localStorage.getItem('cliente_hora') || '--:--';
const operadorId  = parseInt(localStorage.getItem('cliente_operador_id') || '1');

let wsConexion = null;
let yaSonóAlerta = false; 

function init() {
  if (!turnoId) {
    window.location.href = 'index.html';
    return;
  }

  setText('display-turno', turnoCod);
  setText('hora-registro', hora);
  setText('saludo-nombre', nombre);
  setText('user-initials', nombre.charAt(0).toUpperCase());

  actualizarPosicion();

  setInterval(actualizarPosicion, 15000);

  wsConexion = api.conectarWS(operadorId, (data) => {
    const eventosRefresco = ['siguiente_turno', 'turno_atendiendo', 'turno_cancelado', 'turno_finalizado'];
    if (eventosRefresco.includes(data.evento)) {
      actualizarPosicion();
    }
  });
}

async function actualizarPosicion() {
  try {
    const data = await api.getPosicion(turnoId);

    const pos     = Math.max(0, data.posicion);
    const espera  = data.tiempo_estimado_minutos;
    const codigoAtendiendo = data.codigo_atendiendo || '--';
    const nombreOp = data.nombre_operador || '';

    setText('llamando-ahora', codigoAtendiendo);
    setText('nombre-peluquero', nombreOp ? `Con: ${nombreOp}` : "");

    const alertaProximidad = document.getElementById('alerta-proximidad');
    if (pos === 1) {
      alertaProximidad?.classList.remove('hidden');
    } else {
      alertaProximidad?.classList.add('hidden');
    }

    if (pos === 0) {
      setText('tu-posicion',   '¡Es tu turno!');
      setText('espera-min',    '¡PASÁ!');
      setText('hora-estimada', 'Atención en curso');
      setBarWidth('progress-bar', 100);
      document.getElementById('progress-bar')?.classList.replace('bg-primary', 'bg-green-500');
      
      if (!yaSonóAlerta) {
        reproducirSonido();
        yaSonóAlerta = true; 
      }
    } else {
      setText('tu-posicion',   pos);
      setText('espera-min',    `${espera} min`);
      setText('hora-estimada', `~${espera} min`);
      yaSonóAlerta = false; 
      const progreso = Math.max(5, Math.min(95, 100 - pos * 12));
      setBarWidth('progress-bar', progreso);
    }

  } catch (err) {
    console.warn('Turno finalizado o no encontrado');
    mostrarFinalizado();
  }
}

function mostrarFinalizado() {
    const modal = document.getElementById('modal-finalizado');
    if (modal) modal.classList.remove('hidden');
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
    window.location.href = 'index.html';
  }
}

function limpiarSesionCliente() {
  ['cliente_turno_id','cliente_turno_cod','cliente_nombre','cliente_hora','cliente_operador_id']
    .forEach(k => localStorage.removeItem(k));
}

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

window.cancelarTurno = cancelarTurno;
window.addEventListener('DOMContentLoaded', init);