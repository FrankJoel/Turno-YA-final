// js/admin.js  (loginStaff.html)
import api from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  // Si ya hay sesión activa, redirigir según rol
  const user = api.getUser();
  if (user?.rol === 'admin')    { window.location.href = 'AdminOperaciones.html'; return; }
  if (user?.rol === 'operador') { window.location.href = `operador.html?op=${user.operador_id}`; return; }

  const form     = document.querySelector('form');
  const btnLogin = form?.querySelector('button[type="submit"]');
  const msgEl    = () => document.getElementById('msg-login');

  if (!form) return;

  // Toggle visibilidad contraseña
  const btnOjo = form.querySelector('button[type="button"]');
  const inputPwd = form.querySelector('input[type="password"]');
  if (btnOjo && inputPwd) {
    btnOjo.addEventListener('click', () => {
      const esPassword = inputPwd.type === 'password';
      inputPwd.type = esPassword ? 'text' : 'password';
      btnOjo.querySelector('.material-symbols-outlined').innerText = esPassword ? 'visibility_off' : 'visibility';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = form.querySelector('#username-field')?.value?.trim()
                  || form.querySelector('input[type="text"]')?.value?.trim();
    const password = form.querySelector('input[type="password"]')?.value;

    if (!username || !password) {
      mostrarError('Ingresá usuario y contraseña.');
      return;
    }

    if (btnLogin) { btnLogin.disabled = true; btnLogin.innerText = 'Ingresando...'; }

    try {
      const data = await api.login(username, password);
      api.saveSession(data);

      if (data.rol === 'admin') {
        window.location.href = 'AdminOperaciones.html';
      } else {
        window.location.href = `operador.html?op=${data.operador_id}`;
      }

    } catch (err) {
      mostrarError(err.message || 'Credenciales incorrectas.');
    } finally {
      if (btnLogin) { btnLogin.disabled = false; btnLogin.innerText = 'Iniciar sesión'; }
    }
  });

  function mostrarError(msg) {
    let el = document.getElementById('msg-login');
    if (!el) {
      el = document.createElement('div');
      el.id = 'msg-login';
      el.className = 'bg-red-50 text-red-700 text-sm font-bold px-4 py-3 rounded-2xl border border-red-100 mb-4';
      form.prepend(el);
    }
    el.innerText = msg;
    setTimeout(() => el?.remove(), 5000);
  }
  window.cerrarSesion = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'loginStaff.html';
};
});
