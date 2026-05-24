// js/estadisticas.admin.js
import api from './api.js';

const user  = api.getUser();
const estId = parseInt(user.establecimiento_id) || 1;

let periodoActual       = 'hoy';
let datosEstadisticas   = null; // Estado global para el PDF

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

    // Botón PDF
    const btnPDF = document.getElementById('btn-exportar-pdf');
    if (btnPDF) btnPDF.addEventListener('click', exportarPDF);
});

async function cargarEstadisticas(periodo) {
    try {
        let data;
        if (periodo === 'hoy')    data = await api.getEstadisticasHoy(estId);
        if (periodo === 'semana') data = await api.getEstadisticasSemana(estId);
        if (periodo === 'mes')    data = await api.getEstadisticasMes(estId);

        datosEstadisticas = { ...data, periodo }; // Guardar para PDF

        setText('stat-total-atendidos',  data.atendidos ?? 0);
        setText('stat-total-cancelados', data.cancelados ?? 0);
        setText('stat-tiempo-medio',     `${data.promedio_minutos ?? 0}`);
        setText('stat-en-espera',        data.en_espera ?? 0);
        setText('stat-hora-pico',        data.hora_pico && data.hora_pico !== '--' ? `${data.hora_pico} hs` : '--:-- hs');

        const tabla = document.getElementById('tabla-actividad');
        if (tabla && data.ultimos) {
            tabla.innerHTML = data.ultimos.map(t => `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                    <td class="px-8 py-5 font-bold text-primary">${t.codigo}</td>
                    <td class="px-8 py-5 text-sm">${t.motivo}</td>
                    <td class="px-8 py-5 text-sm text-slate-500">${t.hora} hs</td>
                </tr>`).join('');
        }

        const motivos     = data.motivos || {};
        const totalMotivos = Object.values(motivos).reduce((a, b) => a + b, 0) || 1;
        const cont        = document.getElementById('motivos-container');

        if (cont) {
            const entries = Object.entries(motivos).sort((a, b) => b[1] - a[1]);
            cont.innerHTML = entries.length > 0
                ? entries.map(([nombre, cantidad]) => {
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
                }).join('')
                : '<p class="text-slate-400 text-sm italic text-center py-6">Sin datos para este período.</p>';
        }

    } catch (err) {
        console.error('[Estadísticas Admin] Error:', err);
    }
}

// ── EXPORTAR PDF ──────────────────────────────────────────────────────────────
function exportarPDF() {
    if (!datosEstadisticas) {
        alert('Los datos aún no cargaron. Esperá un momento e intentá de nuevo.');
        return;
    }

    const btn = document.getElementById('btn-exportar-pdf');
    if (btn) btn.disabled = true;

    try {
        const jsPDF = window.jspdf.jsPDF;
        const doc        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const AZUL       = [0, 91, 156];
        const AZUL_CLARO = [43, 116, 185];
        const GRIS       = [65, 71, 80];
        const GRIS_CLARO = [241, 245, 249];
        const BLANCO     = [255, 255, 255];
        const ROJO       = [239, 68, 68];
        const W          = 210;

        const labelPeriodo = { hoy: 'Hoy', semana: 'Últimos 7 días', mes: 'Últimos 30 días' };
        const fecha  = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const hora   = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const nombre = user.nombre || 'Administrador';

        // ── HEADER ────────────────────────────────────────────────────────────
        doc.setFillColor(...AZUL);
        doc.rect(0, 0, W, 32, 'F');

        doc.setTextColor(...BLANCO);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('TurnoYa', 14, 14);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Sala de Espera Virtual', 14, 21);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('REPORTE DE ESTADÍSTICAS — ADMIN', W - 14, 14, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Generado: ${fecha} ${hora}`, W - 14, 21, { align: 'right' });
        doc.text(`Admin: ${nombre}  |  Período: ${labelPeriodo[datosEstadisticas.periodo] || 'Hoy'}`, W - 14, 27, { align: 'right' });

        let y = 44;

        // ── KPIs — 4 tarjetas en 2 columnas ──────────────────────────────────
        const kpis = [
            { label: 'ATENDIDOS',         valor: String(datosEstadisticas.atendidos ?? 0),          color: AZUL },
            { label: 'CANCELADOS',        valor: String(datosEstadisticas.cancelados ?? 0),         color: ROJO },
            { label: 'TIEMPO PROMEDIO',   valor: `${datosEstadisticas.promedio_minutos ?? 0} min`,  color: GRIS },
            { label: 'HORA PICO',         valor: datosEstadisticas.hora_pico && datosEstadisticas.hora_pico !== '--' ? `${datosEstadisticas.hora_pico} hs` : '--', color: [180, 120, 0] },
        ];

        const colW = (W - 28 - 6) / 2; // ancho de cada tarjeta
        kpis.forEach((kpi, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x   = 14 + col * (colW + 6);
            const yy  = y + row * 34;

            doc.setFillColor(...GRIS_CLARO);
            doc.roundedRect(x, yy, colW, 28, 3, 3, 'F');

            doc.setTextColor(...GRIS);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text(kpi.label, x + colW / 2, yy + 8, { align: 'center' });

            doc.setTextColor(...kpi.color);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text(kpi.valor, x + colW / 2, yy + 22, { align: 'center' });
        });

        y += 2 * 34 + 8; // 2 filas + margen

        // ── MOTIVOS FRECUENTES ────────────────────────────────────────────────
        const motivos = Object.entries(datosEstadisticas.motivos || {}).sort((a, b) => b[1] - a[1]);
        if (motivos.length > 0) {
            doc.setTextColor(...AZUL);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Motivos Frecuentes', 14, y);

            doc.setDrawColor(...AZUL_CLARO);
            doc.setLineWidth(0.5);
            doc.line(14, y + 2, W - 14, y + 2);
            y += 10;

            const total = motivos.reduce((a, [, v]) => a + v, 0) || 1;

            motivos.forEach(([nombre, cant]) => {
                const pct      = Math.round((cant / total) * 100);
                const barWidth = ((W - 28 - 20) * pct) / 100;

                doc.setTextColor(...GRIS);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(nombre, 14, y + 4);

                doc.setTextColor(...AZUL);
                doc.setFont('helvetica', 'bold');
                doc.text(`${cant} (${pct}%)`, W - 14, y + 4, { align: 'right' });

                doc.setFillColor(226, 232, 240);
                doc.roundedRect(14, y + 6, W - 28 - 14, 4, 2, 2, 'F');

                if (barWidth > 0) {
                    doc.setFillColor(...AZUL);
                    doc.roundedRect(14, y + 6, barWidth, 4, 2, 2, 'F');
                }

                y += 16;
            });

            y += 4;
        }

        // ── ÚLTIMOS ATENDIDOS ─────────────────────────────────────────────────
        const ultimos = datosEstadisticas.ultimos || [];
        if (ultimos.length > 0) {
            doc.setTextColor(...AZUL);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Últimos Clientes Atendidos', 14, y);

            doc.setDrawColor(...AZUL_CLARO);
            doc.setLineWidth(0.5);
            doc.line(14, y + 2, W - 14, y + 2);
            y += 8;

            doc.setFillColor(...AZUL);
            doc.rect(14, y, W - 28, 8, 'F');
            doc.setTextColor(...BLANCO);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text('TICKET',   20,  y + 5.5);
            doc.text('SERVICIO', 60,  y + 5.5);
            doc.text('HORA',    170,  y + 5.5);
            y += 8;

            ultimos.forEach((t, i) => {
                const bg = i % 2 === 0 ? BLANCO : [248, 250, 252];
                doc.setFillColor(...bg);
                doc.rect(14, y, W - 28, 8, 'F');

                doc.setTextColor(...AZUL);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text(t.codigo, 20, y + 5.5);

                doc.setTextColor(...GRIS);
                doc.setFont('helvetica', 'normal');
                doc.text(t.motivo, 60, y + 5.5);
                doc.text(`${t.hora} hs`, 170, y + 5.5);
                y += 8;
            });
        }

        // ── FOOTER ────────────────────────────────────────────────────────────
        const pageH = 297;
        doc.setFillColor(...AZUL);
        doc.rect(0, pageH - 14, W, 14, 'F');
        doc.setTextColor(...BLANCO);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('TurnoYa — Sala de Espera Virtual | Tecnicatura en Análisis de Sistemas 2026', W / 2, pageH - 5, { align: 'center' });

        // ── GUARDAR ───────────────────────────────────────────────────────────
        const periodo     = datosEstadisticas.periodo || 'hoy';
        const fechaArchivo = new Date().toISOString().slice(0, 10);
        doc.save(`TurnoYa_Estadisticas_Admin_${periodo}_${fechaArchivo}.pdf`);

    } catch (err) {
        console.error('[PDF Admin] Error al generar:', err);
        alert('Error al generar el PDF. Revisá la consola.');
    } finally {
        if (btn) btn.disabled = false;
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