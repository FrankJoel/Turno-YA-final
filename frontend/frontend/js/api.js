// Este código busca la Key en Vercel, si no la encuentra usa localhost
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = {
  async request(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Error en la solicitud')
    }
    return res.json()
  },

  getToken() { return localStorage.getItem('token') },
  getUser() { return JSON.parse(localStorage.getItem('user') || '{}') },

  saveSession(data) {
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify({
      rol: data.rol,
      nombre: data.nombre,
      operador_id: data.operador_id,
      establecimiento_id: data.establecimiento_id // Asegúrate de guardar esto si lo necesitas
    }))
  },

  clearSession() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
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

  siguienteTurno: (operadorId) =>
    api.request('POST', `/turnos/siguiente/${operadorId}`, {}, api.getToken()),

  cancelarTurno: (turnoId) =>
    api.request('PATCH', `/turnos/${turnoId}/cancelar`),

  toggleFila: (operadorId) =>
    api.request('PATCH', `/operadores/${operadorId}/fila`, {}, api.getToken()),

  getOperadores: (establecimientoId) =>
    api.request('GET', `/operadores/?establecimiento_id=${establecimientoId}`, null, api.getToken()),

  crearOperador: (data) =>
    api.request('POST', '/operadores/', data, api.getToken()),

  toggleOperador: (operadorId) =>
    api.request('PATCH', `/operadores/${operadorId}/toggle`, {}, api.getToken()),

  // --- SECCIÓN DE ESTADÍSTICAS ---
  getEstadisticasHoy: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/hoy`, null, api.getToken()),

  getEstadisticasSemana: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/semana`, null, api.getToken()),

  getEstadisticasMes: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/mes`, null, api.getToken()),

  getEstadisticasOperadores: (establecimientoId) =>
    api.request('GET', `/estadisticas/${establecimientoId}/operadores`, null, api.getToken()),

  conectarWS(operadorId, onMessage) {
    const wsUrl = API_URL.replace('https', 'wss').replace('http', 'ws')
    const ws = new WebSocket(`${wsUrl}/ws/${operadorId}`)
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
    ws.onclose = () => setTimeout(() => api.conectarWS(operadorId, onMessage), 3000)
    return ws
  }
}

export default api;