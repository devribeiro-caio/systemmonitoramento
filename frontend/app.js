const state = {
  token: localStorage.getItem('formis_token'),
  user: JSON.parse(localStorage.getItem('formis_user') || 'null'),
  attendances: [],
  users: []
};

const statusLabels = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  lost: 'Perdido'
};

const channelLabels = {
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  chat: 'Chat',
  email: 'E-mail',
  other: 'Outro'
};

const $ = (selector) => document.querySelector(selector);
const API_BASE = 'http://127.0.0.1:3000';

// ─── Abas de autenticação ───────────────────────────────────────────────────
$('#tabLogin').addEventListener('click', () => {
  $('#tabLogin').classList.add('active');
  $('#tabRegister').classList.remove('active');
  $('#loginForm').classList.add('active');
  $('#registerForm').classList.remove('active');
  $('#authMessage').textContent = '';
  $('#registerMessage').textContent = '';
});

$('#tabRegister').addEventListener('click', () => {
  $('#tabRegister').classList.add('active');
  $('#tabLogin').classList.remove('active');
  $('#registerForm').classList.add('active');
  $('#loginForm').classList.remove('active');
  $('#authMessage').textContent = '';
  $('#registerMessage').textContent = '';
});

// ─── Utilitários ────────────────────────────────────────────────────────────
function setMessage(id, message, isError = false) {
  const el = $(`#${id}`);
  el.textContent = message;
  el.style.color = isError ? '#d94f4f' : '#66758a';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${state.token}`
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Não foi possível concluir a solicitação.');
  }
  return data;
}

function initials(name) {
  return String(name || 'Formis Monitoramento')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function updateUserUI() {
  if (!state.user) {
    $('#userName').textContent = 'Visitante';
    $('#userRole').textContent = 'Não autenticado';
    $('#userInitials').textContent = 'FM';
    $('#connectionStatus').textContent = 'Aguardando login';
    $('#logoutBtn').classList.add('hidden');
    return;
  }
  $('#userName').textContent = state.user.name;
  $('#userRole').textContent = `${state.user.role} · ${state.user.rootPhone}`;
  $('#userInitials').textContent = initials(state.user.name);
  $('#connectionStatus').textContent = 'Conectado à API';
  $('#logoutBtn').classList.remove('hidden');
}

function setAuthenticated(isAuthenticated) {
  $('#authPanel').classList.toggle('hidden', isAuthenticated);
  $('#appContent').classList.toggle('hidden', !isAuthenticated);
  updateUserUI();
}

// ─── Métricas e renderização ────────────────────────────────────────────────
function renderMetrics() {
  const total = state.attendances.length;
  const progress = state.attendances.filter((i) => i.status === 'in_progress').length;
  const resolved = state.attendances.filter((i) => i.status === 'resolved').length;
  $('#metricTotal').textContent = total;
  $('#metricProgress').textContent = progress;
  $('#metricResolved').textContent = resolved;
  $('#metricRoot').textContent = state.user?.rootPhone || '--';
}

function renderAttendances() {
  const rows = $('#attendanceRows');
  if (!state.attendances.length) {
    rows.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum atendimento encontrado.</td></tr>';
    renderMetrics();
    return;
  }
  rows.innerHTML = state.attendances.map((attendance) => {
    const collaborator = attendance.collaborator?.name || state.user?.name || 'Equipe';
    const startedAt = attendance.startedAt ? new Date(attendance.startedAt).toLocaleString('pt-BR') : '--';
    return `
      <tr>
        <td>
          <strong>${attendance.customerName || 'Cliente sem nome'}</strong><br>
          <small>${attendance.customerPhone}</small>
        </td>
        <td>${channelLabels[attendance.channel] || attendance.channel}</td>
        <td><span class="badge ${attendance.status}">${statusLabels[attendance.status] || attendance.status}</span></td>
        <td>${collaborator}</td>
        <td>${startedAt}</td>
      </tr>
    `;
  }).join('');
  renderMetrics();
}

function renderUsers() {
  const list = $('#teamList');
  if (!state.user) {
    list.innerHTML = '<p class="empty-state">Faça login para carregar a equipe.</p>';
    return;
  }
  if (!state.users.length) {
    list.innerHTML = '<p class="empty-state">Nenhum colaborador encontrado ou acesso restrito.</p>';
    return;
  }
  list.innerHTML = state.users.map((user) => `
    <article class="team-member">
      <div>
        <strong>${user.name}</strong>
        <small>${user.email} · ${user.phone || 'sem telefone'} · Ramal ${user.extension || '--'}</small>
      </div>
      <span class="role-pill">${user.role}</span>
    </article>
  `).join('');
}

// ─── Carregamento de dados ──────────────────────────────────────────────────
async function loadAttendances() {
  if (!state.token) return;
  const status = $('#statusFilter').value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request(`/api/attendances${query}`, { headers: authHeaders() });
  state.attendances = data.attendances || [];
  renderAttendances();
}

async function loadUsers() {
  if (!state.token) return;
  try {
    const data = await request('/api/users', { headers: authHeaders() });
    state.users = data.users || [];
  } catch {
    state.users = [];
  }
  renderUsers();
}

// ─── Autenticação ───────────────────────────────────────────────────────────
async function login(email, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('formis_token', state.token);
  localStorage.setItem('formis_user', JSON.stringify(state.user));
  setAuthenticated(true);
  await loadAttendances();
  await loadUsers();
}

async function register(name, email, password, phone, extension, rootPhone) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, phone, extension, rootPhone })
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('formis_token', state.token);
  localStorage.setItem('formis_user', JSON.stringify(state.user));
  setAuthenticated(true);
  await loadAttendances();
  await loadUsers();
}

function logout() {
  state.token = null;
  state.user = null;
  state.attendances = [];
  state.users = [];
  localStorage.removeItem('formis_token');
  localStorage.removeItem('formis_user');
  renderAttendances();
  renderUsers();
  setAuthenticated(false);
}

// ─── Eventos de formulário ──────────────────────────────────────────────────
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('authMessage', 'Entrando...');
  try {
    await login($('#loginEmail').value.trim(), $('#loginPassword').value);
    setMessage('authMessage', '');
  } catch (error) {
    setMessage('authMessage', error.message, true);
  }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('registerMessage', 'Criando conta...');
  try {
    await register(
      $('#regName').value.trim(),
      $('#regEmail').value.trim(),
      $('#regPassword').value,
      $('#regPhone').value.trim(),
      $('#regExtension').value.trim(),
      $('#regRootPhone').value.trim()
    );
    setMessage('registerMessage', '');
  } catch (error) {
    setMessage('registerMessage', error.message, true);
  }
});

$('#attendanceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await request('/api/attendances', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        customerName: $('#customerName').value.trim(),
        customerPhone: $('#customerPhone').value.trim(),
        channel: $('#channel').value,
        status: $('#status').value,
        notes: $('#notes').value.trim()
      })
    });
    e.target.reset();
    await loadAttendances();
  } catch (error) {
    alert(error.message);
  }
});

$('#userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('userMessage', 'Adicionando colaborador...');
  try {
    await request('/api/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: $('#newUserName').value.trim(),
        email: $('#newUserEmail').value.trim(),
        password: $('#newUserPassword').value,
        role: $('#newUserRole').value,
        phone: $('#newUserPhone').value.trim(),
        extension: $('#newUserExtension').value.trim(),
        rootPhone: $('#newUserRootPhone').value.trim() || state.user.rootPhone
      })
    });
    e.target.reset();
    setMessage('userMessage', 'Colaborador adicionado com sucesso!');
    await loadUsers();
  } catch (error) {
    setMessage('userMessage', error.message, true);
  }
});

$('#refreshBtn').addEventListener('click', loadAttendances);
$('#statusFilter').addEventListener('change', loadAttendances);
$('#logoutBtn').addEventListener('click', logout);

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  });
});

// ─── Inicialização ───────────────────────────────────────────────────────────
setAuthenticated(Boolean(state.token && state.user));
if (state.token && state.user) {
  loadAttendances().catch(() => {
    $('#connectionStatus').textContent = 'API indisponível';
  });
  loadUsers();
}
