// js/api.js
const API_URL = (typeof window !== 'undefined' && window.__ENV__?.VITE_API_URL)
  || "http://localhost:8000";

const api = {
  async request(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Error ${res.status}`);
    }
    return res.json();
  },

  getToken()  { return sessionStorage.getItem('token'); },
  getUser()   { return JSON.parse(sessionStorage.getItem('user') || '{}'); },

  saveSession(data) {
    sessionStorage.setItem('token', data.access_token);
    sessionStorage.setItem('user', JSON.stringify({
      rol:                data.rol,
      nombre:             data.nombre,
      operador_id:        data.operador_id,
      establecimiento_id: data.establecimiento_id,
    }));
  },

  clearSession() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  },

  login: (username, password) =>
    api.request('POST', '/auth/login', { username, password }),

  crearTurno: (data) =>
    api.request('POST', '/turnos/', data),

  buscarTurnoPorDni: (dni, operadorId) =>
    api.request('GET', `/turnos/dni/${dni}/operador/${operadorId}`),

  getPosicion: (turnoId) =>
    api.request('GET', `/turnos/posicion/${turnoId}`),

  getCola: (operadorId) =>
    api.request('GET', `/turnos/cola/${operadorId}`),

  // --- NUEVO: Obtener estado para el Monitor ---
  getEstadoActual: (operadorId) =>
    api.request('GET', `/turnos/estado_actual/${operadorId}`, null, api.getToken())
      .catch(() => null), // Si no hay turno, devolvemos null para no romper el monitor

  // --- GESTIÓN DE TURNOS ---
  siguienteTurno: (operadorId) =>
    api.request('POST', `/turnos/siguiente/${operadorId}`, {}, api.getToken()),

  iniciarAtencion: (turnoId) =>
    api.request('PATCH', `/turnos/${turnoId}/atender`, {}, api.getToken()),

  finalizarTurno: (turnoId) =>
    api.request('PATCH', `/turnos/${turnoId}/finalizar`, {}, api.getToken()),

  cancelarTurno: (turnoId) =>
    api.request('PATCH', `/turnos/${turnoId}/cancelar`, {}, api.getToken()),

  // --- GESTIÓN DE OPERADORES ---
  toggleFila: (operadorId) =>
    api.request('PATCH', `/operadores/${operadorId}/fila`, {}, api.getToken()),

  getOperadores: (establecimientoId) =>
    api.request('GET', `/operadores/?establecimiento_id=${establecimientoId}`, null, api.getToken()),

  crearOperador: (data) =>
    api.request('POST', '/operadores/', data, api.getToken()),

  // --- NUEVO: Actualizar Operador (Necesario para el ABM en modo edición) ---
  actualizarOperador: (operadorId, data) =>
    api.request('PUT', `/operadores/${operadorId}`, data, api.getToken()),

  toggleOperador: (operadorId) =>
    api.request('PATCH', `/operadores/${operadorId}/toggle`, {}, api.getToken()),

  eliminarOperador: (operadorId) =>
    api.request('DELETE', `/operadores/${operadorId}`, null, api.getToken()),

  getQR: (operadorId, baseUrl) =>
    `${API_URL}/operadores/${operadorId}/qr?base_url=${encodeURIComponent(baseUrl)}`,

  // --- ESTADÍSTICAS ---
  getEstadisticasHoy: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/hoy`, null, api.getToken()),

  getEstadisticasSemana: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/semana`, null, api.getToken()),

  getEstadisticasMes: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/mes`, null, api.getToken()),

  getEstadisticasOperadores: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/operadores`, null, api.getToken()),

  // --- WEBSOCKETS ---
  conectarWS(operadorId, onMessage) {
    let ws = null;
    let cerradoManualmente = false;
    function conectar() {
      const wsUrl = API_URL.replace('https', 'wss').replace('http', 'ws');
      ws = new WebSocket(`${wsUrl}/ws/${operadorId}`);
      ws.onopen    = () => console.log(`[WS] Conectado al operador ${operadorId}`);
      ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
      ws.onerror    = (e) => console.warn('[WS] Error:', e);
      ws.onclose   = () => {
        if (!cerradoManualmente) {
          setTimeout(conectar, 3000);
        }
      };
    }
    conectar();
    return { close: () => { cerradoManualmente = true; ws?.close(); } };
  },

  conectarWS_TV(operadorIds, onMessage) {
    const conexiones = operadorIds.map(id => api.conectarWS(id, onMessage));
    return { close: () => conexiones.forEach(c => c.close()) };
  },
};

export default api;