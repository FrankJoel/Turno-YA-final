import api from './api.js';

const user = api.getUser();
const params = new URLSearchParams(window.location.search);
const operadorId = parseInt(user?.operador_id || params.get('op') || '0');
const establecimientoId = user?.establecimiento_id || 1;

window.addEventListener('DOMContentLoaded', async () => {
    if (!operadorId) {
        alert('No se encontró el operador.');
        window.location.href = 'loginStaff.html';
        return;
    }

    const linkPanel = document.getElementById('link-panel');
    if (linkPanel) linkPanel.href = `operador.html?op=${operadorId}`;

    await Promise.all([cargarEstadisticas(), cargarInfoSidebar()]);
});

async function cargarEstadisticas() {
    try {
        const [hoy, semana, mes] = await Promise.all([
            api.getEstadisticasHoy(establecimientoId),
            api.getEstadisticasSemana(establecimientoId),
            api.getEstadisticasMes(establecimientoId),
        ]);

        const dHoy    = hoy.find(o => o.operador_id === operadorId)    || {};
        const dSemana = semana.find(o => o.operador_id === operadorId) || {};
        const dMes    = mes.find(o => o.operador_id === operadorId)    || {};

        setText('stat-hoy-total',      dHoy.total      ?? '--');
        setText('stat-hoy-atendidos',  dHoy.atendidos  ?? '--');
        setText('stat-hoy-cancelados', dHoy.cancelados ?? '--');
        setText('stat-hoy-promedio',   formatearTiempo(dHoy.promedio_segundos));

        setText('stat-sem-total',      dSemana.total      ?? '--');
        setText('stat-sem-atendidos',  dSemana.atendidos  ?? '--');
        setText('stat-sem-cancelados', dSemana.cancelados ?? '--');
        setText('stat-sem-promedio',   formatearTiempo(dSemana.promedio_segundos));

        setText('stat-mes-total',      dMes.total      ?? '--');
        setText('stat-mes-atendidos',  dMes.atendidos  ?? '--');
        setText('stat-mes-cancelados', dMes.cancelados ?? '--');
        setText('stat-mes-promedio',   formatearTiempo(dMes.promedio_segundos));

    } catch (err) {
        console.error('Error cargando estadísticas:', err);
    }
}

async function cargarInfoSidebar() {
    try {
        const operadores = await api.getOperadores(establecimientoId);
        const op = operadores.find(o => o.id === operadorId);
        if (op) {
            setText('saludo-operador', `¡Hola, ${op.nombre}!`);
            setText('username-operador', `@${op.username}`);
            setText('display-puesto', `P${op.id}`);
            const inicial = document.getElementById('user-initial');
            if (inicial) inicial.innerText = op.nombre.charAt(0).toUpperCase();
        }
    } catch (err) {
        console.error('Error cargando sidebar:', err);
    }
}

function formatearTiempo(segundos) {
    if (!segundos) return '--';
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}m ${s}s`;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

window.cerrarSesion = () => {
    api.clearSession();
    window.location.href = 'loginStaff.html';
};