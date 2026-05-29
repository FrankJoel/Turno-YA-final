// js/operador.js
import api from './api.js';

// --- ESTADO GLOBAL ---
let turnoActualId = null;  // ID del turno activo en el puesto
let actualizando = false;  // Flag para evitar llamadas simultáneas al backend
const user = api.getUser();
const params = new URLSearchParams(window.location.search);
const operadorId = parseInt(user.operador_id || params.get('op') || '0');

if (!operadorId) {
    alert('No se encontró el operador. Iniciá sesión primero.');
    window.location.href = 'loginStaff.html';
}

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    // Cargamos el nombre, puesto y estado de fila del operador
    await cargarInfoOperador();

    // Cargamos el estado actual de la pantalla (turno en curso + cola)
    await actualizarPantallaOperador();
    
    // Refresco automático cada 15 segundos como respaldo al WebSocket
    setInterval(actualizarPantallaOperador, 15000);

    // Link a estadísticas personales del operador
    const linkStats = document.getElementById('link-stats');
    if (linkStats) linkStats.href = `estadisticaoperador.html?op=${operadorId}`;

    // WebSocket en tiempo real — escucha eventos del backend
    api.conectarWS(operadorId, async (data) => {
        // Solo reaccionamos a eventos relevantes para esta pantalla
        const eventosRelevantes = ['siguiente_turno', 'turno_atendiendo', 'turno_finalizado', 'turno_cancelado', 'nuevo_turno'];
        if (!eventosRelevantes.includes(data.evento)) return;

        // Si ya hay una actualización en curso, ignoramos para evitar race conditions
        if (actualizando) return;

        actualizando = true;
        await actualizarPantallaOperador();
        actualizando = false;
    });
});

// --- CARGA DE DATOS DEL OPERADOR ---
async function cargarInfoOperador() {
    try {
        const estId = parseInt(user.establecimiento_id) || 1;
        const lista = await api.getOperadores(estId);
        const op = lista.find(o => o.id === operadorId);
        
        if (op) {
            const nombrePuesto = op.puesto || `Puesto ${op.id}`;
            setText('display-puesto', nombrePuesto);
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
// Consulta el estado actual al backend y actualiza los botones y la cola
async function actualizarPantallaOperador() {
    try {
        // 1. Obtener estado actual (quién está en el puesto: llamando o atendiendo)
        const turnoAtendido = await api.request('GET', `/turnos/estado_actual/${operadorId}`, null, api.getToken());
        
        const btnSiguiente = document.getElementById('btn-siguiente');
        const btnAtender = document.getElementById('btn-atender');
        const btnFinalizar = document.getElementById('btn-finalizar');
        const displayTurno = document.getElementById('turno-actual');

        // Reset visual: ocultamos todos los botones antes de decidir cuál mostrar
        btnSiguiente.classList.add('hidden');
        btnAtender.classList.add('hidden');
        btnFinalizar.classList.add('hidden');

        if (!turnoAtendido || Object.keys(turnoAtendido).length === 0) {
            // No hay turno activo: mostrar botón para llamar al siguiente
            turnoActualId = null;
            setText('turno-actual', '---');
            displayTurno.classList.add('text-slate-300');
            setText('label-estado', 'ESPERANDO ACCIÓN');
            btnSiguiente.classList.remove('hidden');
        } else {
            // Hay un turno activo: guardamos su ID y mostramos el botón correspondiente
            turnoActualId = turnoAtendido.id;
            setText('turno-actual', turnoAtendido.codigo);
            displayTurno.classList.remove('text-slate-300');

            if (turnoAtendido.estado === 'llamando') {
                // El cliente fue llamado pero aún no llegó al puesto
                setText('label-estado', 'LLAMANDO CLIENTE...');
                btnAtender.classList.remove('hidden');
            } else if (turnoAtendido.estado === 'atendiendo') {
                // El cliente ya está siendo atendido
                setText('label-estado', 'ATENDIENDO AHORA');
                btnFinalizar.classList.remove('hidden');
            }
        }

        // 2. Cargar la lista de espera (panel derecho)
        const cola = await api.getCola(operadorId);
        renderizarLista(cola);

    } catch (err) {
        console.error('Error al actualizar pantalla:', err);
    }
}

// --- ACCIONES DE BOTONES ---

// Llama al siguiente turno en espera
window.llamarSiguiente = async () => {
    if (actualizando) return; // Evita doble click
    try {
        actualizando = true;
        await api.siguienteTurno(operadorId);
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    } finally {
        actualizando = false; // Siempre libera el flag, incluso si hay error
    }
};

// Confirma que el cliente llegó al puesto e inicia la atención
window.iniciarAtencion = async () => {
    if (!turnoActualId || actualizando) return;
    try {
        actualizando = true;
        await api.iniciarAtencion(turnoActualId);
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    } finally {
        actualizando = false;
    }
};

// Finaliza la atención del turno actual
window.finalizarAtencion = async () => {
    if (!turnoActualId || actualizando) return;
    try {
        actualizando = true;
        await api.finalizarTurno(turnoActualId);
        turnoActualId = null; // Limpiamos el ID local antes de refrescar
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    } finally {
        actualizando = false;
    }
};

// Abre o cierra la fila del operador
window.pausarFila = async () => {
    try {
        const res = await api.toggleFila(operadorId);
        // res trae el nuevo estado de 'fila_abierta'
        actualizarVisualPausa(res.fila_abierta);
    } catch (err) {
        alert("No se pudo cambiar el estado de la fila");
    }
};

// Actualiza el estilo del botón de pausa según si la fila está abierta o cerrada
function actualizarVisualPausa(estaAbierta) {
    const btnPausa = document.getElementById('btn-pausa');
    const txtPausa = document.getElementById('txt-pausa');
    if (!btnPausa || !txtPausa) return;

    if (!estaAbierta) {
        // Fila cerrada: mostrar opción de reanudar
        btnPausa.classList.replace('bg-amber-100', 'bg-green-100');
        btnPausa.classList.replace('text-amber-700', 'text-green-700');
        txtPausa.innerText = "Reanudar Fila";
    } else {
        // Fila abierta: mostrar opción de pausar
        btnPausa.classList.replace('bg-green-100', 'bg-amber-100');
        btnPausa.classList.replace('text-green-700', 'text-amber-700');
        txtPausa.innerText = "Pausar Fila";
    }
}

// --- UTILIDADES ---

// Renderiza la lista de turnos en espera en el panel derecho
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

// Helper para setear texto en un elemento por ID
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

// Cancela un turno específico de la lista de espera
window.cancelarTurnoPorId = async (turnoId) => {
    if (!confirm('¿Cancelar este turno?')) return;
    try {
        await api.cancelarTurno(turnoId);
        await actualizarPantallaOperador();
    } catch (err) {
        alert(err.message);
    }  
};
window.cerrarSesion = () => {
    api.clearSession();
    window.location.href = 'loginStaff.html';
};