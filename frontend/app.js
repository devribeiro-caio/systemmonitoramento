const state = {
  token: localStorage.getItem('formis_token'),
  user: JSON.parse(localStorage.getItem('formis_user') || 'null'),
  attendances: [],
  users: [],
  conversations: [],
  currentMessages: [],
  internalContacts: [],
  onlineUsers: {}
};

const statusLabels = { open:'Aberto', in_progress:'Em andamento', resolved:'Resolvido', lost:'Perdido' };
const channelLabels = { whatsapp:'WhatsApp', phone:'Telefone', chat:'Chat', email:'E-mail', other:'Outro' };

const $ = (sel) => document.querySelector(sel);
const API_BASE = 'http://127.0.0.1:3000';

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getInitials(name) {
  return String(name || 'FM').split(' ').filter(Boolean).slice(0,2).map(p => p[0].toUpperCase()).join('');
}

function setMessage(id, msg, isError = false) {
  const el = $(`#${id}`);
  if (el) { el.textContent = msg; el.style.color = isError ? '#d94f4f' : '#66758a'; }
}

function authHeaders() {
  return { 'Content-Type':'application/json', Authorization:`Bearer ${state.token}` };
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Erro na requisição.');
  return data;
}

// ── Controle de acesso ───────────────────────────────────────────────────────

function isAdmin() { return state.user && (state.user.role === 'admin' || state.user.role === 'supervisor'); }

function applyAccessControl() {
  // Menu Equipe: só admin/supervisor
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !isAdmin());
  });
}

// ── Navegação ────────────────────────────────────────────────────────────────

function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
  const metricsRow = $('#metricsRow');
  if (viewName === 'dashboard' || viewName === 'attendances') {
    metricsRow.classList.remove('hidden');
  } else {
    metricsRow.classList.add('hidden');
  }
  const section = $(`#view-${viewName}`);
  if (section) section.classList.remove('hidden');

  // Preencher configurações ao entrar
  if (viewName === 'settings' && state.user) {
    $('#settingsName').value = state.user.name || '';
    $('#settingsEmail').value = state.user.email || '';
    $('#settingsRootPhone').value = state.user.rootPhone || '';
  }
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    this.classList.add('active');
    switchView(this.getAttribute('data-view'));
  });
});

// ── Autenticação ─────────────────────────────────────────────────────────────

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
  $('#userRole').textContent = `${state.user.role} · ${state.user.rootPhone || '--'}`;
  $('#userInitials').textContent = getInitials(state.user.name);
  $('#connectionStatus').textContent = 'Conectado à API';
  $('#logoutBtn').classList.remove('hidden');
}

function setAuthenticated(isAuthenticated) {
  $('#authPanel').classList.toggle('hidden', isAuthenticated);
  $('#appContent').classList.toggle('hidden', !isAuthenticated);
  updateUserUI();
  if (isAuthenticated) {
    applyAccessControl();
    switchView('dashboard');
  }
}

async function login(email, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ email, password })
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('formis_token', state.token);
  localStorage.setItem('formis_user', JSON.stringify(state.user));
  setAuthenticated(true);
  await loadAttendances();
  await loadUsers();
  startPolling();
  initializeSocket();
  loadConversations();
}

function logout() {
  state.token = null; state.user = null;
  state.attendances = []; state.users = [];
  state.conversations = []; state.currentMessages = [];
  localStorage.removeItem('formis_token');
  localStorage.removeItem('formis_user');
  if (refreshInterval) clearInterval(refreshInterval);
  if (socket) socket.disconnect();
  setAuthenticated(false);
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('.primary-btn');
  btn.textContent = 'Entrando...'; btn.disabled = true;
  try {
    await login($('#loginEmail').value.trim(), $('#loginPassword').value);
    setMessage('authMessage', '');
  } catch (err) {
    setMessage('authMessage', err.message, true);
    btn.textContent = 'Entrar'; btn.disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', logout);

// ── Métricas ──────────────────────────────────────────────────────────────────

function animateValue(id, start, end, duration = 500) {
  const obj = $(`#${id}`);
  if (!obj || start === end) { if (obj) obj.textContent = end; return; }
  let t = null;
  const step = (ts) => {
    if (!t) t = ts;
    const progress = Math.min((ts - t) / duration, 1);
    obj.textContent = Math.floor(progress * (end - start) + start);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderMetrics() {
  const total = state.attendances.length;
  const progress = state.attendances.filter(i => i.status === 'in_progress').length;
  const resolved = state.attendances.filter(i => i.status === 'resolved').length;
  animateValue('metricTotal', parseInt($('#metricTotal').textContent) || 0, total);
  animateValue('metricProgress', parseInt($('#metricProgress').textContent) || 0, progress);
  animateValue('metricResolved', parseInt($('#metricResolved').textContent) || 0, resolved);
  $('#metricRoot').textContent = state.user?.rootPhone || '--';
}

// ── Atendimentos ──────────────────────────────────────────────────────────────

function renderAttendances() {
  const rows = $('#attendanceRows');
  if (!state.attendances.length) {
    rows.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum atendimento encontrado.</td></tr>';
    renderMetrics(); return;
  }
  rows.innerHTML = state.attendances.map(a => {
    const collaborator = a.collaborator?.name || state.user?.name || 'Equipe';
    const startedAt = a.startedAt ? new Date(a.startedAt).toLocaleString('pt-BR') : '--';
    return `<tr>
      <td><strong>${escapeHtml(a.customerName || 'Sem nome')}</strong><br><small>${escapeHtml(a.customerPhone)}</small></td>
      <td>${channelLabels[a.channel] || a.channel}</td>
      <td><span class="badge ${a.status}">${statusLabels[a.status] || a.status}</span></td>
      <td>${escapeHtml(collaborator)}</td>
      <td>${startedAt}</td>
    </tr>`;
  }).join('');
  renderMetrics();
}

async function loadAttendances() {
  if (!state.token) return;
  try {
    const status = $('#statusFilter')?.value || '';
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await request(`/api/attendances${query}`, { headers: authHeaders() });
    state.attendances = data.attendances || [];
    renderAttendances();
  } catch (err) { console.error('Erro ao carregar atendimentos:', err); }
}

$('#attendanceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('.primary-btn');
  const orig = btn.textContent;
  btn.textContent = 'Registrando...'; btn.disabled = true;
  try {
    await request('/api/attendances', {
      method: 'POST', headers: authHeaders(),
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
    btn.textContent = '✓ Registrado';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  } catch (err) {
    btn.textContent = orig; btn.disabled = false;
    alert(err.message);
  }
});

$('#refreshBtn').addEventListener('click', loadAttendances);
$('#statusFilter').addEventListener('change', loadAttendances);

// ── Equipe ────────────────────────────────────────────────────────────────────

function renderUsers() {
  const list = $('#teamList');
  if (!state.users.length) {
    list.innerHTML = '<p class="empty-state">Nenhum colaborador encontrado.</p>'; return;
  }
  list.innerHTML = state.users.map(user => `
    <article class="team-member">
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <small>${escapeHtml(user.email)} · ${user.phone || 'sem telefone'} · Ramal ${user.extension || '--'}</small>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="role-pill">${user.role}</span>
        ${isAdmin() ? `<button class="icon-btn btn-remove-user" data-id="${user._id}" data-name="${escapeHtml(user.name)}" title="Remover">✕</button>` : ''}
      </div>
    </article>
  `).join('');

  // Listeners para remover usuário
  document.querySelectorAll('.btn-remove-user').forEach(btn => {
    btn.addEventListener('click', () => removeUser(btn.dataset.id, btn.dataset.name));
  });
}

async function loadUsers() {
  if (!state.token) return;
  try {
    const data = await request('/api/users', { headers: authHeaders() });
    state.users = data.users || [];
    renderUsers();
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
    state.users = []; renderUsers();
  }
}

async function removeUser(userId, userName) {
  if (!confirm(`Remover o colaborador "${userName}"?`)) return;
  try {
    await request(`/api/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
    await loadUsers();
  } catch (err) { alert('Erro ao remover: ' + err.message); }
}

$('#userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('.primary-btn');
  const orig = btn.textContent;
  btn.textContent = 'Adicionando...'; btn.disabled = true;
  try {
    await request('/api/users', {
      method: 'POST', headers: authHeaders(),
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
    setMessage('userMessage', '✓ Colaborador adicionado com sucesso!');
    await loadUsers();
    btn.textContent = '✓ Adicionado';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; setMessage('userMessage', ''); }, 2000);
  } catch (err) {
    btn.textContent = orig; btn.disabled = false;
    setMessage('userMessage', err.message, true);
  }
});

// ── Configurações ─────────────────────────────────────────────────────────────

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await request(`/api/users/${state.user.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        name: $('#settingsName').value.trim(),
        rootPhone: $('#settingsRootPhone').value.trim()
      })
    });
    state.user = { ...state.user, ...data.user };
    localStorage.setItem('formis_user', JSON.stringify(state.user));
    updateUserUI();
    setMessage('settingsMessage', '✓ Perfil atualizado!');
    setTimeout(() => setMessage('settingsMessage', ''), 2000);
  } catch (err) { setMessage('settingsMessage', err.message, true); }
});

$('#passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await request(`/api/users/${state.user.id}/password`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        currentPassword: $('#currentPassword').value,
        newPassword: $('#newPassword').value
      })
    });
    e.target.reset();
    setMessage('passwordMessage', '✓ Senha atualizada!');
    setTimeout(() => setMessage('passwordMessage', ''), 2000);
  } catch (err) { setMessage('passwordMessage', err.message, true); }
});

// ── Polling ───────────────────────────────────────────────────────────────────

let refreshInterval;
function startPolling() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(loadAttendances, 30000);
}

// ── Socket.io ─────────────────────────────────────────────────────────────────

let socket = null;
let currentChatId = null;
let currentChatType = 'external';
let currentInternalChatUserId = null;
let isSendingMessage = false;

function initializeSocket() {
  if (!state.token || typeof io === 'undefined') return;
  socket = io(API_BASE, { auth: { token: state.token } });
  socket.on('connect', () => {
    if (state.user) {
      socket.emit('authenticate', state.token);
      socket.emit('join_dashboard', state.user.rootPhone);
    }
  });
  socket.on('new_message', (msg) => {
    if (currentChatId === msg.attendance) renderMessageInChat(msg);
  });
  socket.on('private_message', (msg) => {
    if (currentChatType === 'internal' && currentInternalChatUserId === msg.senderId) renderMessageInChat(msg);
  });
  socket.on('user_online', (d) => { state.onlineUsers[d.userId] = true; updateContactPresence(d.userId, true); });
  socket.on('user_offline', (d) => { delete state.onlineUsers[d.userId]; updateContactPresence(d.userId, false); });
}

// ── Chat Externo ──────────────────────────────────────────────────────────────

async function loadConversations() {
  if (!state.token) return;
  try {
    const data = await request('/api/chat/conversations', { headers: authHeaders() });
    state.conversations = data.conversations || [];
    renderConversations();
  } catch (err) { console.error('Erro ao carregar conversas:', err); }
}

function renderConversations() {
  const list = $('#conversationList');
  if (!state.conversations.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma conversa ativa.</p>'; return;
  }
  list.innerHTML = state.conversations.map(conv => `
    <div class="conversation-item ${currentChatId === conv._id ? 'active' : ''}" data-conversation-id="${conv._id}">
      <div class="conversation-header">
        <p class="conversation-name">${escapeHtml(conv.customerName || 'Cliente')}</p>
        <span class="conversation-time">${new Date(conv.startedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>
      <p class="conversation-preview">${escapeHtml(conv.customerPhone)}</p>
    </div>
  `).join('');
  document.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => openConversation(item.getAttribute('data-conversation-id')));
  });
}

async function openConversation(conversationId) {
  currentChatId = conversationId;
  document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-conversation-id="${conversationId}"]`)?.classList.add('active');
  $('#chatWindow .chat-empty-state').classList.add('hidden');
  $('#activeChat').classList.remove('hidden');
  const conv = state.conversations.find(c => c._id === conversationId);
  if (conv) {
    $('#activeChatName').textContent = conv.customerName || 'Cliente';
    $('#activeChatAvatar').textContent = (conv.customerName || 'C')[0].toUpperCase();
    $('#activeChatStatus').textContent = channelLabels[conv.channel] || 'Chat';
  }
  await loadChatMessages(conversationId);
  if (socket) socket.emit('join_chat', conversationId);
}

async function loadChatMessages(conversationId) {
  try {
    const data = await request(`/api/chat/messages/${conversationId}`, { headers: authHeaders() });
    state.currentMessages = data.messages || [];
    renderChatMessages();
    setTimeout(() => { const m = $('#chatMessages'); m.scrollTop = m.scrollHeight; }, 100);
  } catch (err) { console.error('Erro ao carregar mensagens:', err); }
}

function renderChatMessages() {
  const div = $('#chatMessages');
  if (!state.currentMessages.length) {
    div.innerHTML = '<p class="empty-state">Nenhuma mensagem ainda.</p>'; return;
  }
  div.innerHTML = state.currentMessages.map(msg => {
    const isOwn = msg.senderType === 'collaborator';
    const time = new Date(msg.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    if (msg.type === 'pabx_call') {
      return `<div class="message system"><div class="message-bubble">📞 ${escapeHtml(msg.content)}</div><div class="message-time">${time}</div></div>`;
    }
    return `<div class="message ${isOwn ? 'own' : 'other'}"><div class="message-bubble">${escapeHtml(msg.content)}</div><div class="message-time">${time}</div></div>`;
  }).join('');
}

function renderMessageInChat(msg) {
  const div = $('#chatMessages');
  const isOwn = msg.senderType === 'collaborator';
  const time = new Date(msg.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const html = msg.type === 'pabx_call'
    ? `<div class="message system"><div class="message-bubble">📞 ${escapeHtml(msg.content)}</div><div class="message-time">${time}</div></div>`
    : `<div class="message ${isOwn ? 'own' : 'other'}"><div class="message-bubble">${escapeHtml(msg.content)}</div><div class="message-time">${time}</div></div>`;
  div.innerHTML += html;
  div.scrollTop = div.scrollHeight;
}

// ── Chat Interno ──────────────────────────────────────────────────────────────

async function loadInternalContacts() {
  if (!state.token) return;
  try {
    const data = await request('/api/users/colleagues', { headers: authHeaders() }); // ← aqui
    state.internalContacts = (data.users || []).filter(u => u._id !== state.user?.id);
    renderInternalContacts();
  } catch (err) {
    console.error('Erro ao carregar contatos internos:', err);
  }
}

function renderInternalContacts() {
  const list = $('#internalContactList');
  if (!state.internalContacts.length) {
    list.innerHTML = '<p class="empty-state">Nenhum colaborador.</p>'; return;
  }
  list.innerHTML = state.internalContacts.map(user => {
    const isOnline = !!state.onlineUsers[user._id];
    return `
      <div class="internal-contact ${currentInternalChatUserId === user._id ? 'active' : ''}" data-user-id="${user._id}">
        <div class="contact-avatar ${isOnline ? 'online' : 'offline'}">${getInitials(user.name)}</div>
        <div class="contact-info">
          <p class="contact-name">${escapeHtml(user.name)}</p>
          <p class="contact-status ${isOnline ? 'online' : 'offline'}">${isOnline ? '● Online' : '● Offline'}</p>
        </div>
      </div>`;
  }).join('');
  document.querySelectorAll('.internal-contact').forEach(item => {
    item.addEventListener('click', () => openInternalChat(item.getAttribute('data-user-id')));
  });
}

async function openInternalChat(userId) {
  currentInternalChatUserId = userId;
  document.querySelectorAll('.internal-contact').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');
  $('#chatWindow .chat-empty-state').classList.add('hidden');
  $('#activeChat').classList.remove('hidden');
  const user = state.internalContacts.find(u => u._id === userId);
  if (user) {
    $('#activeChatName').textContent = user.name;
    $('#activeChatAvatar').textContent = getInitials(user.name);
    $('#activeChatStatus').textContent = 'Colaborador';
  }
  try {
    const data = await request(`/api/chat/private/${userId}`, { headers: authHeaders() });
    state.currentMessages = data.messages || [];
    renderChatMessages();
    setTimeout(() => { const m = $('#chatMessages'); m.scrollTop = m.scrollHeight; }, 100);
  } catch (err) { console.error('Erro ao carregar mensagens privadas:', err); }
  if (socket) socket.emit('join_private_chat', userId);
}

function updateContactPresence(userId, isOnline) {
  const el = document.querySelector(`[data-user-id="${userId}"]`);
  if (!el) return;
  const avatar = el.querySelector('.contact-avatar');
  const status = el.querySelector('.contact-status');
  avatar.className = `contact-avatar ${isOnline ? 'online' : 'offline'}`;
  status.className = `contact-status ${isOnline ? 'online' : 'offline'}`;
  status.textContent = isOnline ? '● Online' : '● Offline';
}

// ── Envio de mensagens ────────────────────────────────────────────────────────

function sendMessage() {
  if (currentChatType === 'internal' && currentInternalChatUserId) {
    sendToEndpoint(`/api/chat/private/${currentInternalChatUserId}`);
  } else if (currentChatId) {
    sendToEndpoint(`/api/chat/messages/${currentChatId}`);
  }
}

function sendToEndpoint(endpoint) {
  const input = $('#chatInput');
  const content = input.value.trim();
  if (!content || isSendingMessage) return;
  isSendingMessage = true;
  const btn = $('#sendMsgBtn');
  btn.disabled = true;
  renderMessageInChat({ content, senderType:'collaborator', createdAt: new Date(), type:'text' });
  input.value = ''; input.focus();
  request(endpoint, {
    method:'POST', headers: authHeaders(),
    body: JSON.stringify({ content, type:'text' })
  })
  .catch(err => {
    const div = $('#chatMessages');
    div.innerHTML += `<div class="message system"><div class="message-bubble" style="color:#d94f4f">⚠ Erro: ${escapeHtml(err.message)}</div></div>`;
    div.scrollTop = div.scrollHeight;
  })
  .finally(() => { isSendingMessage = false; btn.disabled = false; });
}

$('#sendMsgBtn').addEventListener('click', (e) => { e.preventDefault(); sendMessage(); });
$('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

let typingTimeout;
$('#chatInput').addEventListener('input', () => {
  if (socket && currentChatId) {
    socket.emit('typing', currentChatId);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('stop_typing', currentChatId), 3000);
  }
});

// ── Abas do Chat ──────────────────────────────────────────────────────────────

document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const type = tab.getAttribute('data-chat-type');
    currentChatType = type;
    if (type === 'external') {
      $('#externalChatHeader').classList.remove('hidden');
      $('#internalChatHeader').classList.add('hidden');
      $('#conversationList').classList.remove('hidden');
      $('#internalContactList').classList.add('hidden');
    } else {
      $('#externalChatHeader').classList.add('hidden');
      $('#internalChatHeader').classList.remove('hidden');
      $('#conversationList').classList.add('hidden');
      $('#internalContactList').classList.remove('hidden');
      loadInternalContacts();
    }
    $('#chatWindow .chat-empty-state').classList.remove('hidden');
    $('#activeChat').classList.add('hidden');
    currentChatId = null; currentInternalChatUserId = null;
  });
});

// ── Modal Nova Conversa ───────────────────────────────────────────────────────

$('#newChatBtn').addEventListener('click', () => { $('#newChatModal').classList.remove('hidden'); $('#newChatName').focus(); });
$('#closeNewChatModal').addEventListener('click', () => { $('#newChatModal').classList.add('hidden'); $('#newChatForm').reset(); });
$('#newChatModal').addEventListener('click', (e) => { if (e.target === $('#newChatModal')) { $('#newChatModal').classList.add('hidden'); $('#newChatForm').reset(); } });

$('#newChatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('.primary-btn');
  const orig = btn.textContent;
  btn.textContent = 'Criando...'; btn.disabled = true;
  try {
    const response = await request('/api/attendances', {
      method:'POST', headers: authHeaders(),
      body: JSON.stringify({
        customerName: $('#newChatName').value.trim() || 'Cliente',
        customerPhone: $('#newChatPhone').value.trim(),
        channel: 'chat', status: 'open',
        notes: 'Atendimento iniciado via chat'
      })
    });
    $('#newChatModal').classList.add('hidden');
    $('#newChatForm').reset();
    await loadConversations();
    if (response._id) openConversation(response._id);
    btn.textContent = '✓ Criado';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  } catch (err) {
    btn.textContent = orig; btn.disabled = false;
    alert('Erro: ' + err.message);
  }
});

$('#chatSearch').addEventListener('input', async (e) => {
  const query = e.target.value.trim();
  if (!query) { loadConversations(); return; }
  try {
    const data = await request(`/api/chat/conversations/search?query=${encodeURIComponent(query)}`, { headers: authHeaders() });
    state.conversations = data.conversations || [];
    renderConversations();
  } catch (err) { console.error('Erro na busca:', err); }
});

$('#internalSearch').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.internal-contact').forEach(item => {
    item.style.display = item.querySelector('.contact-name').textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});

// ── Inicialização ─────────────────────────────────────────────────────────────

setAuthenticated(Boolean(state.token && state.user));
if (state.token && state.user) {
  loadAttendances().catch(() => { $('#connectionStatus').textContent = 'API indisponível'; });
  loadUsers();
  startPolling();
  initializeSocket();
  loadConversations();
  applyAccessControl();
}