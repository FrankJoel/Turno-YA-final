// js/gestion-usuarios.js
import api from './api.js';

const user            = api.getUser();
const establecimientoId = user.establecimiento_id || 1;
const baseUrl = `${window.location.origin}/frontend/frontend`;

let listaLocalOperadores = [];

window.addEventListener('DOMContentLoaded', () => {
  cargarOperadores();
});

async function cargarOperadores() {
  const contenedor = document.getElementById('lista-operadores-container');
  if (contenedor) contenedor.innerHTML = '<div class="px-8 py-10 text-center text-slate-400 italic">Cargando...</div>';

  try {
    const operadores = await api.getOperadores(establecimientoId);
    // Mantenemos el filtro para no mostrar admins en la lista de gestión
    listaLocalOperadores = operadores.filter(op => op.rol !== 'admin');
    
    actualizarContadores(listaLocalOperadores);
    renderizarOperadores(listaLocalOperadores);
  } catch (err) {
    if (contenedor) contenedor.innerHTML = `<div class="px-8 py-10 text-center text-red-400">${err.message}</div>`;
  }
}

function actualizarContadores(operadores) {
  const total     = operadores.length;
  const activos   = operadores.filter(op => op.activo).length;
  const inactivos = total - activos;
  
  setText('stat-total',     total);
  setText('stat-activos',   activos);
  setText('stat-inactivos', inactivos);
  setText('contador-footer', `Mostrando ${total} de ${total} operadores`);
}

function renderizarOperadores(operadores) {
  const contenedor = document.getElementById('lista-operadores-container');
  if (!contenedor) return;

  if (operadores.length === 0) {
    contenedor.innerHTML = '<div class="px-8 py-10 text-center text-slate-400 italic">No hay operadores registrados.</div>';
    return;
  }

  contenedor.innerHTML = operadores.map(op => {
    const esInactivo = !op.activo;
    const iniciales  = `${(op.nombre||' ').charAt(0)}${(op.apellido||' ').charAt(0)}`.toUpperCase();
    
    // --- NUEVO: Conteo de servicios configurados ---
    const cantServicios = op.servicios ? op.servicios.length : 0;
    const badgeServicios = cantServicios > 0 
      ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold border border-blue-100">${cantServicios} servicios</span>`
      : `<span class="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold border border-amber-100">Sin servicios</span>`;

    return `
      <div id="fila-op-${op.id}" class="grid grid-cols-12 gap-4 px-8 py-6 items-center hover:bg-surface-container-low transition-colors border-b border-slate-50 last:border-none ${esInactivo ? 'opacity-50 grayscale' : ''}">
        <div class="col-span-4 flex items-center gap-4">
          <div class="w-12 h-12 rounded-full ${esInactivo ? 'bg-slate-300' : 'bg-primary-container'} flex items-center justify-center text-white font-bold shadow-sm">
            ${iniciales}
          </div>
          <div>
            <p class="font-bold text-slate-900 text-lg ${esInactivo ? 'line-through text-slate-400' : ''}">${op.nombre} ${op.apellido}</p>
            <div class="flex items-center gap-2">
               <p class="text-sm text-slate-500">${op.puesto}</p>
               ${badgeServicios}
            </div>
          </div>
        </div>
        <div class="col-span-3 text-slate-600 font-medium">@${op.username}</div>
        <div class="col-span-2">
          <button onclick="toggleEstado(${op.id})" 
                  class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full transition-all text-xs font-bold hover:scale-105 ${esInactivo ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}">
            <span class="w-2 h-2 rounded-full ${esInactivo ? 'bg-slate-400' : 'bg-green-500 animate-pulse'}"></span>
            ${esInactivo ? 'Inactivo' : 'Activo'}
          </button>
        </div>
        <div class="col-span-3 flex justify-end gap-2">
          <a href="${api.getQR(op.id, baseUrl)}" target="_blank" class="p-2 rounded-full text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Ver QR">
            <span class="material-symbols-outlined">qr_code</span>
          </a>
          <button onclick="window.location.href='abm.html?edit=${op.id}'" class="p-2 rounded-full text-slate-400 hover:text-primary hover:bg-blue-50 transition-all" title="Editar">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button onclick="confirmarEliminar(${op.id}, '${op.nombre} ${op.apellido}')" class="p-2 rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Eliminar">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>`;
  }).join('');
}
async function toggleEstado(operadorId) {
  try {
    const res = await api.toggleOperador(operadorId);
    const index = listaLocalOperadores.findIndex(o => o.id === operadorId);
    if (index !== -1) {
        listaLocalOperadores[index].activo = res.activo;
        actualizarContadores(listaLocalOperadores);
        renderizarOperadores(listaLocalOperadores);
    }
  } catch (err) {
    alert('Error al cambiar estado: ' + err.message);
  }
}

function confirmarEliminar(operadorId, nombre) {
  if (confirm(`¿Eliminar definitivamente a ${nombre}? Esta acción no se puede deshacer.`)) {
    eliminarDefinitivo(operadorId);
  }
}

async function eliminarDefinitivo(operadorId) {
  try {
    await api.eliminarOperador(operadorId);
    listaLocalOperadores = listaLocalOperadores.filter(op => op.id !== operadorId);
    actualizarContadores(listaLocalOperadores);
    renderizarOperadores(listaLocalOperadores);
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

window.toggleEstado      = toggleEstado;
window.confirmarEliminar = confirmarEliminar;