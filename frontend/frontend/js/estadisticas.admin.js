// js/estadisticas.admin.js
import api from './api.js';

const user   = api.getUser();
const estId  = user.establecimiento_id || 1;

let periodoActual = 'hoy';

window.addEventListener('DOMContentLoaded', () => {
    cargarEstadisticas('hoy');

    // Botones Hoy / Semana / Mes
    document.querySelectorAll('header button').forEach((btn, idx) => {
        const periodos = ['hoy', 'semana', 'mes'];
        btn.addEventListener('click', () => {
            document.querySelectorAll('header button').forEach(b => {
                b.className = 'px-6 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-white transition-all';
            });
            btn.className = 'px-6 py-2 rounded-full text-sm font-bold transition-all bg-primary text-white shadow-md';
            periodoActual = periodos[idx];
            cargarEstadisticas(periodoActual);
        });
    });
});

async function cargarEstadisticas(periodo) {
  try {
    let data;
    if (periodo === 'hoy')    data = await api.getEstadisticasHoy(estId);
    if (periodo === 'semana') data = await api.getEstadisticasSemana(estId);
    if (periodo === 'mes')    data = await api.getEstadisticasMes(estId);

    console.log("Datos procesados:", data);

    // 1. Números Principales (Cards)
  
    setText('stat-total-atendidos',  data.atendidos ?? 0);
    setText('stat-total-cancelados', data.cancelados ?? 0);
    setText('stat-tiempo-medio',     `${data.promedio_minutos ?? 0}`);
    setText('stat-en-espera',        data.en_espera ?? 0);
    setText('stat-hora-pico',        data.hora_pico && data.hora_pico !== "--" ? `${data.hora_pico} hs` : '--:-- hs');

    // 3. Tabla de Actividad
    const tabla = document.getElementById('tabla-actividad');
    if (tabla && data.ultimos) {
        tabla.innerHTML = data.ultimos.map(t => `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                <td class="px-8 py-5 font-bold text-primary">${t.codigo}</td>
                <td class="px-8 py-5 text-sm">${t.motivo}</td>
                <td class="px-8 py-5 text-sm text-slate-500">${t.hora} hs</td>
            </tr>
        `).join('');
    }

    // 4. Barras de Motivos (Frecuentes)
    const motivos = data.motivos || {};
    const totalMotivos = Object.values(motivos).reduce((a, b) => a + b, 0) || 1;
    const cont = document.getElementById('motivos-container');
    
    if (cont) {
        cont.innerHTML = Object.entries(motivos)
            .sort((a, b) => b[1] - a[1])
            .map(([nombre, cantidad]) => {
                const pct = Math.round((cantidad / totalMotivos) * 100);
                return `
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-sm font-semibold">${nombre}</span>
                        <span class="text-sm font-bold text-primary">${cantidad} (${pct}%)</span>
                    </div>
                    <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-primary rounded-full" style="width:${pct}%"></div>
                    </div>
                </div>`;
            }).join('');
    }
  } catch (err) {
    console.error('Error estadísticas:', err);
  }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}

window.cerrarSesion = () => {
    api.clearSession();
    window.location.href = 'loginStaff.html';
};