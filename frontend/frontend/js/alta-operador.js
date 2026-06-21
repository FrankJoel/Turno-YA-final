import api from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('form-alta-op');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit'); // Detectamos si venimos de "Editar"
  const user = api.getUser();
  const establecimientoId = user.establecimiento_id || 1;

  // 1. SI ES EDICIÓN: Precargamos los datos
  if (editId) {
    try {
      // Ajustamos la estética para modo edición 
      document.querySelector('h3.text-2xl').innerText = "EDITAR OPERADOR";
      const btnSubmit = form.querySelector('button[type="submit"]');
      btnSubmit.innerHTML = `<span class="material-symbols-outlined">save</span> Guardar Cambios`;
      btnSubmit.classList.replace('bg-[#1e8e3e]', 'bg-primary');

      const operadores = await api.getOperadores(establecimientoId);
      const op = operadores.find(o => o.id == editId);

      if (op) {
        form.nombre.value   = op.nombre || '';
        form.apellido.value = op.apellido || '';
        form.dni.value      = op.dni || '';
        form.rol.value      = op.rol || 'operador';
        form.puesto.value   = op.puesto || '';

        // Llenamos la tabla de servicios con los del operador
        const tbody = document.getElementById('lista-motivos');
        if (op.servicios && op.servicios.length > 0) {
          tbody.innerHTML = ''; 
          op.servicios.forEach(s => {
            agregarFilaConDatos(s.motivo, s.tiempo_estimado);
          });
        }
      }
    } catch (err) {
      console.error("Error al cargar operador:", err);
    }
  }

  // 2. ENVÍO DEL FORMULARIO
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const servicios = [];
    // Seleccionamos las filas de la tabla
    const filas = document.querySelectorAll('#lista-motivos tr');
    
    filas.forEach(fila => {
      const isChecked = fila.querySelector('input[type="checkbox"]')?.checked;
      
      // Accedemos a las celdas (td) para separar los inputs por posición
      const celdas = fila.querySelectorAll('td');
      
      if (isChecked && celdas.length >= 3) {
        // La celda 1 tiene el motivo, la celda 2 tiene el tiempo
        const motivoInput = celdas[1].querySelector('input[type="text"]');
        const tiempoInput = celdas[2].querySelector('input[type="text"]');

        if (motivoInput && motivoInput.value.trim()) {
          servicios.push({
            motivo: motivoInput.value.trim(),
            // capturamos específicamente el valor del segundo input
            tiempo_estimado: tiempoInput?.value || "00:20"
          });
        }
      }
    });

    // ...  payload y enviar a la API

    const payload = {
      nombre: form.nombre.value.trim(),
      apellido: form.apellido.value.trim(),
      dni: form.dni.value.trim(),
      rol: form.rol.value,
      puesto: form.puesto.value,
      establecimiento_id: establecimientoId,
      servicios: servicios
    };

    try {
      if (editId) {
        await api.actualizarOperador(editId, payload);
        alert("Operador actualizado!");
      } else {
        await api.crearOperador(payload);
        alert("Operador creado con éxito!");
      }
      window.location.href = 'AdminGestionUser.html';
    } catch (err) {
      alert("Error al procesar: " + err.message);
    }
  });
});

// Función auxiliar para rellenar la tabla en edición
function agregarFilaConDatos(motivo, tiempo) {
  const tbody = document.getElementById('lista-motivos');
  const tr = document.createElement('tr');
  tr.className = "bg-white/40";
  tr.innerHTML = `
    <td class="px-6 py-4 text-center">
      <input type="checkbox" checked class="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary/20">
    </td>
    <td class="px-4 py-4">
      <input type="text" value="${motivo}" class="js-motivo w-full bg-transparent border-none p-0 font-bold text-sm text-on-surface focus:ring-0">
    </td>
    <td class="px-6 py-4 text-right font-black text-lg text-primary">
      <input type="text" placeholder="00:20" value="${tiempo}" class="js-tiempo bg-surface-container-high rounded-lg border-none px-3 py-1 w-20 text-right focus:ring-2 focus:ring-primary/20">
    </td>
    <td class="px-6 py-4">
      <button type="button" onclick="this.closest('tr').remove()" class="text-outline-variant hover:text-red-500 transition-colors">
        <span class="material-symbols-outlined">delete</span>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
}
window.generarQR = async function() {
  if (!editId) {
    alert('Primero guardá el operador para poder generar el QR.');
    return;
  }
  try {
    const baseUrl = `${window.location.origin}/frontend/frontend`;
    const url = await api.getQR(editId, baseUrl);
    window.open(url, '_blank');
  } catch (err) {
    alert('Error al generar QR: ' + err.message);
  }
};