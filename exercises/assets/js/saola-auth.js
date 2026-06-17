(function () {
  const script = document.currentScript;
  const widgetEnabled = !script || script.dataset.widget !== 'off';
  const STORAGE_KEY = 'saola_auth_state';
  const FLAG_KEY = 'saola_static_login';
  const STATIC_PASSWORD = window.SAOLA_STATIC_PASSWORD || 'saola2026';

  function readStorage(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      if (storage.getItem(FLAG_KEY) === 'true') {
        return {
          authenticated: true,
          mode: 'authenticated_student',
          student_name: 'Saola Student',
          email: '',
          auth_token: 'static_local_login',
        };
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  function getSavedUser() {
    return readStorage(localStorage) || readStorage(sessionStorage);
  }

  function syncGlobalUser() {
    const user = getSavedUser();
    if (user) window.SAOLA_USER = { ...(window.SAOLA_USER || {}), ...user };
    return user;
  }

  function persistUser(user, remember) {
    const storage = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    storage.setItem(STORAGE_KEY, JSON.stringify(user));
    storage.setItem(FLAG_KEY, 'true');
    try {
      other.removeItem(STORAGE_KEY);
      other.removeItem(FLAG_KEY);
    } catch (_err) {}
    window.SAOLA_USER = { ...(window.SAOLA_USER || {}), ...user };
  }

  function login(password, options = {}) {
    if (String(password || '').trim() !== STATIC_PASSWORD) {
      return { ok: false, message: 'Wrong password.' };
    }

    const user = {
      authenticated: true,
      mode: 'authenticated_student',
      student_name: options.studentName || options.student_name || 'Saola Student',
      email: options.email || '',
      auth_token: options.authToken || options.auth_token || 'static_local_login',
      saved_at: new Date().toISOString(),
    };
    persistUser(user, Boolean(options.remember));
    return { ok: true, user };
  }

  function rememberExternalLogin(data = {}, options = {}) {
    const user = {
      authenticated: true,
      mode: 'authenticated_student',
      student_name: data.student_name || data.studentName || data.email || 'Saola Student',
      email: data.email || '',
      auth_token: data.auth_token || data.authToken || 'static_local_login',
      saved_at: new Date().toISOString(),
    };
    persistUser(user, Boolean(options.remember));
    return user;
  }

  function logout() {
    [localStorage, sessionStorage].forEach(storage => {
      try {
        storage.removeItem(STORAGE_KEY);
        storage.removeItem(FLAG_KEY);
        storage.removeItem('saola_auth_token');
        storage.removeItem('saolaAuthToken');
        storage.removeItem('auth_token');
      } catch (_err) {}
    });
    if (window.SAOLA_USER) window.SAOLA_USER.authenticated = false;
    renderWidget();
  }

  function isLoggedIn() {
    return Boolean(syncGlobalUser());
  }

  function renderWidget() {
    if (!widgetEnabled) return;
    if (document.body?.classList.contains('test-engine-theme')) return;
    if (document.body?.classList.contains('writing-test-page')) return;

    let host = document.getElementById('saola-auth-widget');
    if (!host) {
      host = document.createElement('aside');
      host.id = 'saola-auth-widget';
      document.body.appendChild(host);
    }

    const user = syncGlobalUser();
    host.innerHTML = user ? `
      <div class="saola-auth-card">
        <strong>${escapeHtml(user.student_name || user.email || 'Logged in')}</strong>
        <button type="button" data-auth-action="logout">Logout</button>
      </div>
    ` : `
      <form class="saola-auth-card" data-auth-form>
        <strong>Student login</strong>
        <input type="password" name="password" autocomplete="current-password" placeholder="Password">
        <label><input type="checkbox" name="remember" checked> Save login</label>
        <button type="submit">Login</button>
        <small data-auth-error></small>
      </form>
    `;

    ensureStyle();

    const form = host.querySelector('[data-auth-form]');
    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        const result = login(form.password.value, { remember: form.remember.checked });
        if (!result.ok) {
          form.querySelector('[data-auth-error]').textContent = result.message;
          return;
        }
        renderWidget();
      });
    }

    const logoutBtn = host.querySelector('[data-auth-action="logout"]');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  function ensureStyle() {
    if (document.getElementById('saola-auth-style')) return;
    const style = document.createElement('style');
    style.id = 'saola-auth-style';
    style.textContent = `
      #saola-auth-widget {
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 5000;
        font-family: Arial, sans-serif;
      }
      .saola-auth-card {
        display: grid;
        gap: 8px;
        width: 190px;
        padding: 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 8px 24px rgba(15,23,42,0.12);
        color: #0f172a;
        font-size: 13px;
      }
      .saola-auth-card input[type="password"] {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 7px 8px;
        font: inherit;
      }
      .saola-auth-card label {
        display: flex;
        gap: 6px;
        align-items: center;
        color: #475569;
      }
      .saola-auth-card button {
        border: 0;
        border-radius: 6px;
        background: #1c7ed6;
        color: #fff;
        padding: 7px 10px;
        font-weight: 700;
        cursor: pointer;
      }
      .saola-auth-card small {
        min-height: 14px;
        color: #dc2626;
      }
      @media (max-width: 760px) {
        #saola-auth-widget {
          position: static;
          margin: 10px 12px 0;
        }
        .saola-auth-card {
          width: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.SaolaAuth = {
    login,
    logout,
    isLoggedIn,
    getSavedUser,
    rememberExternalLogin,
    syncGlobalUser,
  };

  syncGlobalUser();
  document.addEventListener('DOMContentLoaded', renderWidget);
})();
