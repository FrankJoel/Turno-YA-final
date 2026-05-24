import api from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form-registro-turno');
    const selectMotivo = document.getElementById('motivo');
    const btnSubmit = document.getElementById('btn-sacar-turno');

    let establecimientoIdDinamico;

    const params = new URLSearchParams(window.location.search);
    const operadorId = parseInt(params.get('op'), 10);
    const estIdParam = parseInt(params.get('est'), 10);

    if (!form) return;

    // Validación inicial de parámetros QR
    if (!operadorId || isNaN(operadorId) || !estIdParam || isNaN(estIdParam)) {
        console.error("ERROR: QR incompleto.");
        mostrarErrorGlobal("El código QR es inválido o está incompleto.");
        return; 
    }

    establecimientoIdDinamico = estIdParam;

    // 1. Carga de datos del operador y servicios
    try {
        const dataOp = await api.request('GET', `/operadores/${operadorId}`); 
        
        // Sincronizamos el ID del establecimiento desde la DB
        establecimientoIdDinamico = dataOp.establecimiento_id; 

        if (dataOp.servicios && dataOp.servicios.length > 0) {
            selectMotivo.innerHTML = '<option value="" disabled selected>Seleccioná un motivo...</option>';

            dataOp.servicios.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.motivo; 
                const tiempoValido = /^\d{1,2}:\d{2}$|^\d+$/.test(s.tiempo_estimado?.trim());
                opt.innerText = tiempoValido
                    ? `${s.motivo} (${s.tiempo_estimado} min)`
                    : s.motivo;
                selectMotivo.appendChild(opt);
            });
        } else {
            mostrarErrorGlobal("Este operador no tiene servicios configurados.");
        }

    } catch (err) {
        console.error("Error cargando servicios:", err);
        mostrarErrorGlobal("Error al conectar con el servidor.");
    }

    // 2. Manejo del envío del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = 'Generando turno...';
        }

        const nombre = form.full_name ? form.full_name.value.trim() : "";
        const dni = form.dni ? form.dni.value.trim() : "";
        const motivo = selectMotivo.value;

        if (!nombre || !dni || !motivo) {
            mostrarError('Completá todos los campos.');
            resetBtn();
            return;
        }

        try {
            // Llamada a la API para crear el turno
            const turno = await api.crearTurno({
                dni_cliente: dni,
                nombre_cliente: nombre,
                motivo: motivo,
                operador_id: operadorId,
                establecimiento_id: establecimientoIdDinamico 
            });
            console.log('Turno creado:', turno);
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                await suscribirNotificaciones(turno.id);
            }
            
            // GUARDADO DE SESIÓN (Crítico para miTurno.html)
            localStorage.setItem('cliente_turno_id', turno.id);
            localStorage.setItem('cliente_turno_cod', turno.codigo);
            localStorage.setItem('cliente_nombre', nombre);
            localStorage.setItem('cliente_operador_id', operadorId);
            
            const ahora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            localStorage.setItem('cliente_hora', ahora);

            // Redirección exitosa
            window.location.href = 'miTurno.html';

        } catch (err) {
            mostrarError(err.message || 'Error al sacar turno.');
            resetBtn();
        }
    });

    // --- FUNCIONES DE APOYO ---

    function resetBtn() {
        if (!btnSubmit) return;
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Sacar Turno <span class="material-symbols-outlined">confirmation_number</span>';
    }

    function mostrarError(msg) {
        let alerta = document.getElementById('alerta-error');
        if (!alerta) {
            alerta = document.createElement('div');
            alerta.id = 'alerta-error';
            alerta.className = 'bg-red-50 text-red-700 text-sm font-bold px-4 py-3 rounded-2xl border border-red-100 mt-2';
            form.prepend(alerta);
        }
        alerta.innerText = msg;
        setTimeout(() => alerta?.remove(), 4000);
    }
    async function suscribirNotificaciones(turnoId) {
    try {
        // 1. Pedir clave pública VAPID al backend
        const config = await api.request('GET', '/config/vapid-public-key');
        const vapidPublicKey = config.public_key;

        // 2. Registrar el Service Worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // 3. Suscribirse al push
        const suscripcion = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidPublicKey
        });

        // 4. Enviar el token al backend
        await api.actualizarPushToken(turnoId, JSON.stringify(suscripcion));
        console.log('Suscripción push registrada correctamente.');

    } catch (err) {
        console.warn('No se pudo suscribir a notificaciones push:', err);
    }
}
    function mostrarErrorGlobal(msg) {
        const contenedor = document.querySelector('main') || document.body;
        contenedor.innerHTML = `
            <div class="p-8 text-center">
                <span class="material-symbols-outlined text-red-500 text-6xl">error_cookie</span>
                <p class="mt-4 text-slate-600 font-bold">${msg}</p>
            </div>
        `;
    }
});