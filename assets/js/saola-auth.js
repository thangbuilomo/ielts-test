(function () {
  const script = document.currentScript;
  const widgetEnabled = !script || script.dataset.widget !== 'off';
  const STORAGE_KEY = 'saola_auth_state';
  const FLAG_KEY = 'saola_static_login';
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbz6mSuAhOl6yIEfuYYLPUvi4LAjTOTwA0t3ik5MBi515I7twRBsWNLR-2apjRwqQgPbFw/exec';
  const GAS_URL = window.SAOLA_AUTH_GAS_URL || script?.dataset.gasUrl || DEFAULT_GAS_URL;
  const GLOBAL_AUTH_TEST_ID = window.SAOLA_AUTH_TEST_ID || document.body?.dataset.authTestId || 'saola_global_login';

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

  function displayNameFromAccount(account) {
    const value = String(account || '').trim();
    if (!value) return '';
    return value.includes('@') ? value.split('@')[0] : value;
  }

  async function login(password, options = {}) {
    const account = String(options.account || options.email || options.studentName || options.student_name || '').trim();
    const email = String(options.email || (account.includes('@') ? account : '')).trim();

    if (!email) {
      return { ok: false, message: 'Use your student email to log in.' };
    }
    if (!String(password || '').trim()) {
      return { ok: false, message: 'Enter your password.' };
    }

    if (GAS_URL) {
      try {
        const testId = options.testId || options.test_id || GLOBAL_AUTH_TEST_ID;
        const credentials = await buildAuthCredentials(password);
        const response = await requestStudentAuth(email, credentials, testId);

        if (response && response.ok) {
          const user = rememberExternalLogin({
            ...response,
            account: email,
            token_scope_test_id: testId,
          }, { remember: Boolean(options.remember) });
          return { ok: true, user };
        }

        return {
          ok: false,
          message: response?.message || 'Login failed. Please check your email and password.',
        };
      } catch (err) {
        return {
          ok: false,
          message: err?.message || 'Could not connect to the login server.',
        };
      }
    }

    return { ok: false, message: 'Login failed. Please check your email and password.' };
  }

  function rememberExternalLogin(data = {}, options = {}) {
    const account = String(data.account || data.email || data.student_name || data.studentName || '').trim();
    const user = {
      authenticated: true,
      mode: 'authenticated_student',
      student_name: data.student_name || data.studentName || data.email || 'Saola Student',
      email: data.email || '',
      account,
      auth_token: data.auth_token || data.authToken || 'static_local_login',
      token_scope_test_id: data.token_scope_test_id || data.tokenScopeTestId || '',
      saved_at: new Date().toISOString(),
    };
    persistUser(user, Boolean(options.remember));
    return user;
  }

  async function buildAuthCredentials(password) {
    const trimmed = String(password || '').trim();
    try {
      return { password_hash: await sha256Hex(trimmed) };
    } catch (_err) {
      return { password: trimmed };
    }
  }

  async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      throw new Error('Secure password login is not available in this browser.');
    }

    const data = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function requestStudentAuth(email, credentials, testId) {
    return new Promise((resolve, reject) => {
      const callbackName = `saolaWidgetAuth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const scriptTag = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Could not connect to the login server.'));
      }, 12000);

      function cleanup() {
        clearTimeout(timer);
        delete window[callbackName];
        if (scriptTag.parentNode) scriptTag.parentNode.removeChild(scriptTag);
      }

      window[callbackName] = data => {
        cleanup();
        resolve(data || {});
      };

      const url = new URL(GAS_URL);
      url.searchParams.set('action', 'auth_student');
      url.searchParams.set('email', email);
      Object.keys(credentials || {}).forEach(key => {
        url.searchParams.set(key, credentials[key]);
      });
      url.searchParams.set('test_id', testId || GLOBAL_AUTH_TEST_ID);
      url.searchParams.set('callback', callbackName);
      url.searchParams.set('_', String(Date.now()));

      scriptTag.onerror = () => {
        cleanup();
        reject(new Error('Could not connect to the login server.'));
      };
      scriptTag.src = url.toString();
      document.head.appendChild(scriptTag);
    });
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
    host.innerHTML = `
      <div class="saola-auth-fab-container">
        <div class="saola-auth-popover" style="display: none;" id="saola-auth-popover">
          ${user ? `
            <div class="saola-auth-card">
              <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px;">Student Profile</div>
              <div style="color: #475569; margin-bottom: 8px;">${escapeHtml(user.student_name || user.email || user.account || 'Logged in')}</div>
              <button type="button" data-auth-action="logout" class="saola-auth-btn-outline">Logout</button>
            </div>
          ` : `
            <form class="saola-auth-card" data-auth-form>
              <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px;">Student login</div>
              <input type="email" name="account" autocomplete="username" placeholder="Student email">
              <input type="password" name="password" autocomplete="current-password" placeholder="Password">
              <label><input type="checkbox" name="remember" checked> Save login</label>
              <button type="submit" class="saola-auth-btn-primary">Login</button>
              <small data-auth-error></small>
            </form>
          `}
        </div>
        <button type="button" class="saola-auth-fab" id="saola-auth-toggle-btn" title="Student Login">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          ${user ? '<span class="saola-auth-status-dot"></span>' : ''}
        </button>
      </div>
    `;

    ensureStyle();

    const toggleBtn = document.getElementById('saola-auth-toggle-btn');
    const popover = document.getElementById('saola-auth-popover');
    
    if (toggleBtn && popover) {
      toggleBtn.addEventListener('click', () => {
        popover.style.display = popover.style.display === 'none' ? 'block' : 'none';
      });
      
      // Close popover when clicking outside
      document.addEventListener('click', (e) => {
        if (!host.contains(e.target)) {
          popover.style.display = 'none';
        }
      });
    }

    const form = host.querySelector('[data-auth-form]');
    if (form) {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const account = form.account.value.trim();
        if (!account) {
          form.querySelector('[data-auth-error]').textContent = 'Enter your student email.';
          return;
        }
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorEl = form.querySelector('[data-auth-error]');
        errorEl.textContent = '';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Checking...';
        const result = await login(form.password.value, {
          remember: form.remember.checked,
          account,
          email: account.includes('@') ? account : '',
        });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
        if (!result.ok) {
          errorEl.textContent = result.message;
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
        bottom: 24px;
        right: 24px;
        z-index: 5000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .saola-auth-fab-container {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }
      .saola-auth-fab {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #1e293b;
        color: #fff;
        border: none;
        box-shadow: 0 4px 12px rgba(15,23,42,0.2);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, background 0.2s;
        position: relative;
      }
      .saola-auth-fab:hover {
        background: #0f172a;
        transform: scale(1.05);
      }
      .saola-auth-status-dot {
        position: absolute;
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        background: #10b981;
        border: 2px solid #fff;
        border-radius: 50%;
      }
      .saola-auth-popover {
        position: absolute;
        bottom: 60px;
        right: 0;
        animation: saola-fade-in 0.2s ease-out;
      }
      @keyframes saola-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .saola-auth-card {
        display: grid;
        gap: 8px;
        width: 220px;
        padding: 16px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 10px 25px rgba(15,23,42,0.15);
        color: #0f172a;
        font-size: 14px;
      }
      .saola-auth-card input[type="password"],
      .saola-auth-card input[type="text"],
      .saola-auth-card input[type="email"] {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 9px 10px;
        font: inherit;
        outline: none;
        transition: border-color 0.2s;
      }
      .saola-auth-card input[type="password"]:focus,
      .saola-auth-card input[type="text"]:focus,
      .saola-auth-card input[type="email"]:focus {
        border-color: #3b82f6;
      }
      .saola-auth-card label {
        display: flex;
        gap: 6px;
        align-items: center;
        color: #475569;
        font-size: 13px;
        cursor: pointer;
      }
      .saola-auth-btn-primary, .saola-auth-btn-outline {
        border: 0;
        border-radius: 6px;
        padding: 9px 12px;
        font-weight: 700;
        cursor: pointer;
        text-align: center;
        transition: background 0.2s;
      }
      .saola-auth-btn-primary {
        background: #2563eb;
        color: #fff;
      }
      .saola-auth-btn-primary:hover {
        background: #1d4ed8;
      }
      .saola-auth-btn-outline {
        background: #fff;
        color: #dc2626;
        border: 1px solid #fca5a5;
      }
      .saola-auth-btn-outline:hover {
        background: #fef2f2;
      }
      .saola-auth-card small {
        min-height: 14px;
        color: #dc2626;
        font-size: 12px;
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
    requestStudentAuth,
    logout,
    isLoggedIn,
    getSavedUser,
    rememberExternalLogin,
    syncGlobalUser,
  };

  syncGlobalUser();
  document.addEventListener('DOMContentLoaded', renderWidget);
})();
