// frontend/js/registro-cliente.js
import api from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form-registro-turno');
    const selectMotivo = document.getElementById('motivo');
    const btnSubmit = document.getElementById('btn-sacar-turno');

    // --- LECTURA DEL ID DESDE EL QR ---
    // El QR apunta a: index.html?op=2
    // Este es el ID real del operador en la DB, y es la única fuente de verdad.
    const params = new URLSearchParams(window.location.search);
    const operadorId = parseInt(params.get('op'), 10);
    if (!document.getElementById('form-registro-turno')) return;
    // Guarda explícita: si el QR no tiene ?op= válido, cortamos antes de cualquier llamada
    if (!operadorId || isNaN(operadorId)) {
        console.error("ERROR: QR inválido — falta el parámetro ?op= o no es un número.");
        mostrarErrorGlobal("Este QR no es válido. Pedile uno nuevo al operador.");
        return; // Detiene toda la ejecución del script
    }

    if (!form || !selectMotivo) return;

    // --- 1. CARGA DINÁMICA DE SERVICIOS ---
    try {
        
    //  consultamos los datos de este operador específico
    const resOp = await fetch(`${api.BASE_URL}/operadores/${operadorId}`); 
    if (!resOp.ok) throw new Error("No se pudo obtener la info del operador");
    
    const dataOp = await resOp.json();
    // Obtenemos el ID del establecimiento al que pertenece este operador
    const establecimientoId = dataOp.establecimiento_id || 1; 

    //  pedimos todos los operadores de ESE establecimiento 
    const operadores = await api.getOperadores(establecimientoId);
    
    // Buscamos por el ID numérico del QR
    const opActual = operadores.find(o => o.id === operadorId);

    if (opActual && opActual.servicios && opActual.servicios.length > 0) {
        selectMotivo.innerHTML = '<option value="" disabled selected>Seleccioná un motivo...</option>';

            opActual.servicios.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.motivo; // El value es el motivo, lo que el backend busca

                // Mostramos tiempo estimado solo si parece un formato de tiempo válido,
                // si no, mostramos solo el motivo para no confundir al cliente
                const tiempoValido = /^\d{1,2}:\d{2}$|^\d+$/.test(s.tiempo_estimado?.trim());
                opt.innerText = tiempoValido
                    ? `${s.motivo} (${s.tiempo_estimado} min)`
                    : s.motivo;

                selectMotivo.appendChild(opt);
            });
        } else {
            console.warn("El operador no tiene servicios o no fue encontrado.");
            mostrarErrorGlobal("Este operador no tiene servicios disponibles.");
        }

    } catch (err) {
        console.error("Error cargando servicios del operador:", err);
        mostrarErrorGlobal("No se pudo cargar la información. Intentá de nuevo.");
    }

    // --- 2. ENVÍO DEL TURNO ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = 'Generando turno...';
        }

        const nombre = form.full_name.value.trim();
        const dni = form.dni.value.trim();
        const motivo = selectMotivo.value;

        if (!nombre || !dni || !motivo) {
            mostrarError('Completá todos los campos.');
            resetBtn();
            return;
        }

        // ... (lógica de validación y deshabilitar botón igual que antes) ...

    try {
        const turno = await api.crearTurno({
            dni_cliente: dni,
            nombre_cliente: nombre,
            motivo: motivo,
            operador_id: operadorId,
            establecimiento_id: 1
        });

        // --- NUEVO: INTENTO DE SUSCRIPCIÓN A PUSH ---
        // Intentamos suscribir al cliente. Si falla o el cliente rechaza, 
        // el proceso sigue igual para no arruinar la experiencia.
        try {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                // Llamamos a la función que definimos antes
                await suscribirNotificaciones(turno.id); 
            }
        } catch (pushErr) {
            console.warn("No se pudo suscribir a push, pero el turno se creó:", pushErr);
        }

        // Persistimos datos (igual que antes)
        localStorage.setItem('cliente_turno_id', turno.id);
        // ... rest of local storage items ...

        window.location.href = 'miTurno.html';

    } catch (err) {
        mostrarError(err.message || 'Error al sacar turno. Intentá de nuevo.');
        resetBtn();
    }
});

    // --- Helpers ---
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

    function mostrarErrorGlobal(msg) {
        // Muestra un error fuera del form, útil cuando el QR es inválido
        // y el form todavía no existe o no debe usarse
        const contenedor = document.querySelector('main') || document.body;
        const alerta = document.createElement('div');
        alerta.className = 'bg-red-50 text-red-700 text-sm font-bold px-4 py-3 rounded-2xl border border-red-100 m-4';
        alerta.innerText = msg;
        contenedor.prepend(alerta);
    }
});