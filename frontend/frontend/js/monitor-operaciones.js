import api from './api.js';

const user = api.getUser();
const establecimientoId = user.establecimiento_id || 1;

let wsConexiones = [];

window.addEventListener('DOMContentLoaded', async () => {
  await cargarMonitor();
  setInterval(cargarMonitor, 30000);
});

async function cargarMonitor() {
  try {
    const operadores = await api.getOperadores(establecimientoId);
    
    // ---  Traer el estado actual de turnos para cada operador ---
    // Usamos Promise.all para que sea rápido
    const operadoresConTurno = await Promise.all(operadores.map(async (op) => {
        try {
            const estadoActual = await api.getEstadoActual(op.id); // Tu endpoint /estado_actual/{id}
            return { ...op, turno_actual: estadoActual };
        } catch {
            return { ...op, turno_actual: null };
        }
    }));

    renderizarOperadores(operadoresConTurno);
    actualizarContadores(operadoresConTurno);

    if (wsConexiones.length === 0) {
      wsConexiones = operadores.map(op =>
        api.conectarWS(op.id, async () => {
          await cargarMonitor();
        })
      );
    }

    let totalEspera = 0;
    for (const op of operadores) {
      try {
        const cola = await api.getCola(op.id);
        totalEspera += cola.filter(t => t.estado === 'esperando').length;
      } catch {}
    }
    setText('espera-total', totalEspera);

  } catch (err) {
    console.error('Error al cargar monitor:', err.message);
  }
}

function renderizarOperadores(operadores) {
  const body = document.getElementById('monitor-operadores-body');
  if (!body) return;

  if (operadores.length === 0) {
    body.innerHTML = '<div class="p-20 text-center text-slate-300 font-medium">No hay operadores registrados</div>';
    return;
  }

  body.innerHTML = operadores.map(op => {
    const activo   = op.activo && op.fila_abierta;
    const iniciales = `${(op.nombre||'').charAt(0)}${(op.apellido||'').charAt(0)}`.toUpperCase();
    
    // Lógica de etiquetas de estado
    let label = 'Inactivo';
    let statusBg = 'bg-red-100';
    let statusTx = 'text-red-700';
    let statusDot = 'bg-red-600';

    if (activo) {
        if (op.turno_actual) {
            label = op.turno_actual.estado === 'llamando' ? 'Llamando...' : 'En atención';
            statusBg = 'bg-blue-100';
            statusTx = 'text-blue-700';
            statusDot = 'bg-blue-600 animate-bounce';
        } else {
            label = 'Disponible / Esperando';
            statusBg = 'bg-green-100';
            statusTx = 'text-green-700';
            statusDot = 'bg-green-600 animate-pulse';
        }
    }

    // Información del turno 
    const infoTurno = op.turno_actual 
        ? `<div class="text-[10px] text-slate-500 mt-0.5 font-normal">
             ${op.turno_actual.codigo} - ${op.turno_actual.motivo}
           </div>`
        : '';

    return `
      <div class="grid grid-cols-12 px-8 py-5 items-center hover:bg-white/50 transition-colors border-b border-slate-50 last:border-none ${activo ? '' : 'opacity-60'}">
        <div class="col-span-5 flex items-center gap-3">
          <div class="w-10 h-10 rounded-fu1ll bg-blue-100 flex items-center justify-center font-bold text-primary text-sm">
            ${iniciales}
          </div>
          <div class="flex flex-col">
            <span class="font-semibold text-sm">${op.nombre} ${op.apellido}</span>
            ${infoTurno}
          </div>
        </div>
        <span class="col-span-3 text-sm font-medium text-slate-600">${op.puesto}</span>
        <div class="col-span-4 flex justify-end">
          <span class="px-3 py-1 rounded-full ${statusBg} ${statusTx} text-xs font-bold flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
            ${label}
          </span>
        </div>
      </div>`;
  }).join('');
}

function actualizarContadores(operadores) {
  const total   = operadores.length;
  const activos = operadores.filter(op => op.activo && op.fila_abierta).length;
  setText('monitor-contadores-top', `${activos}/${total}`);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}
