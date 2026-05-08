// js/operador.js
import api from './api.js';

let turnoActualId = null;
const user = api.getUser();
const params = new URLSearchParams(window.location.search);
const operadorId = parseInt(user.operador_id || params.get('op') || '0');

if (!operadorId) {
    alert('No se encontró el operador. Iniciá sesión primero.');
    window.location.href = 'loginStaff.html';
}

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    await cargarInfoOperador();
    await actualizarPantallaOperador(); // Esta reemplaza a cargarCola inicial
    
    // Intervalo para refrescar la lista de espera
    setInterval(actualizarPantallaOperador, 15000);

    const linkStats = document.getElementById('link-stats');
    if (linkStats) linkStats.href = `estadisticaoperador.html?op=${operadorId}`;

    // WebSocket en tiempo real
    api.conectarWS(operadorId, (data) => {
        // Si hay cambios en la fila, refrescamos todo el panel
        actualizarPantallaOperador();
    });
});

async function cargarInfoOperador() {
    try {
        const estId = user.establecimiento_id || 1;
        const lista = await api.getOperadores(estId);
        const op = lista.find(o => o.id === operadorId);
        if (op) {
            setText('display-puesto', `P${op.id}`);
            setText('saludo-operador', `¡Hola, ${op.nombre}!`);
            setText('username-operador', `@${op.username}`);
            
            // Sincronizar el botón de pausa con el estado real de la DB
            actualizarVisualPausa(op.fila_abierta);
        }
    } catch (err) {
        console.error("Error cargando info:", err);
    }
}

// --- LÓGICA PRINCIPAL DE INTERFAZ ---
async function actualizarPantallaOperador() {
    try {
        // 1. Obtener estado actual (quién está en el puesto)
        const turnoAtendido = await api.request('GET', `/turnos/estado_actual/${operadorId}`, null, api.getToken());
        
        const btnSiguiente = document.getElementById('btn-siguiente');
        const btnAtender = document.getElementById('btn-atender');
        const btnFinalizar = document.getElementById('btn-finalizar');
        const displayTurno = document.getElementById('turno-actual');
        const labelEstado = document.getElementById('label-estado');

        // Reset visual
        btnSiguiente.classList.add('hidden');
        btnAtender.classList.add('hidden');
        btnFinalizar.classList.add('hidden');

        if (!turnoAtendido || Object.keys(turnoAtendido).length === 0) {
            turnoActualId = null;
            setText('turno-actual', '---');
            displayTurno.classList.add('text-slate-300');
            setText('label-estado', 'ESPERANDO ACCIÓN');
            btnSiguiente.classList.remove('hidden');
        } else {
            turnoActualId = turnoAtendido.id;
            setText('turno-actual', turnoAtendido.codigo);
            displayTurno.classList.remove('text-slate-300');

            if (turnoAtendido.estado === 'llamando') {
                setText('label-estado', 'LLAMANDO CLIENTE...');
                btnAtender.classList.remove('hidden');
            } else if (turnoAtendido.estado === 'atendiendo') {
                setText('label-estado', 'ATENDIENDO AHORA');
                btnFinalizar.classList.remove('hidden');
            }
        }

        // 2. Cargar la lista de espera (derecha)
        const cola = await api.getCola(operadorId);
        renderizarLista(cola);

    } catch (err) {
        console.error('Error al actualizar pantalla:', err);
    }
}

// --- ACCIONES DE BOTONES ---

window.llamarSiguiente = async () => {
    try {
        await api.siguienteTurno(operadorId);
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    }
};

window.iniciarAtencion = async () => {
    if (!turnoActualId) return;
    try {
        await api.iniciarAtencion(turnoActualId);
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    }
};

window.finalizarAtencion = async () => {
    if (!turnoActualId) return;
    try {
        await api.finalizarTurno(turnoActualId);
        turnoActualId = null;
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    }
};

window.pausarFila = async () => {
    try {
        const res = await api.toggleFila(operadorId);
        // res suele traer el nuevo estado de 'fila_abierta'
        actualizarVisualPausa(res.fila_abierta);
    } catch (err) {
        alert("No se pudo cambiar el estado de la fila");
    }
};

function actualizarVisualPausa(estaAbierta) {
    const btnPausa = document.getElementById('btn-pausa');
    const txtPausa = document.getElementById('txt-pausa');
    if (!btnPausa || !txtPausa) return;

    if (!estaAbierta) {
        btnPausa.classList.replace('bg-amber-100', 'bg-green-100');
        btnPausa.classList.replace('text-amber-700', 'text-green-700');
        txtPausa.innerText = "Reanudar Fila";
    } else {
        btnPausa.classList.replace('bg-green-100', 'bg-amber-100');
        btnPausa.classList.replace('text-green-700', 'text-amber-700');
        txtPausa.innerText = "Pausar Fila";
    }
}

// --- UTILIDADES ---

function renderizarLista(cola) {
    const contenedor = document.getElementById('lista-espera');
    if (!contenedor) return;

    if (cola.length === 0) {
        contenedor.innerHTML = `<p class="text-center text-slate-400 text-sm py-10">No hay turnos en espera</p>`;
        return;
    }

    contenedor.innerHTML = cola.map(t => `
        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
                <p class="font-black text-primary text-lg">${t.codigo}</p>
                <p class="text-[10px] text-slate-400 uppercase">${t.motivo || 'Consulta general'}</p>
            </div>
            <button onclick="cancelarTurnoPorId(${t.id})" class="text-slate-300 hover:text-red-500 transition-colors">
                <span class="material-symbols-outlined">cancel</span>
            </button>
        </div>
    `).join('');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

window.cancelarTurnoPorId = async (turnoId) => {
    if (!confirm('¿Cancelar este turno?')) return;
    try {
        await api.cancelarTurno(turnoId);
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    }
};