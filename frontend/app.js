const state = {
  token: localStorage.getItem('formis_token'),
  user: JSON.parse(localStorage.getItem('formis_user') || 'null'),
  attendances: [],
  users: [],
  conversations: [],
  currentMessages: []
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

// ────────────────────────────────────────────────────────────────────────────
// NAVEGAÇÃO
// ────────────────────────────────────────────────────────────────────────────

function switchView(viewName) {
  // Ocultar todas as seções
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.add('hidden');
  });
  
  // Ocultar/mostrar métricas
  const metricsRow = $('#metricsRow');
  if (viewName === 'dashboard' || viewName === 'attendances') {
    metricsRow.classList.remove('hidden');
  } else {
    metricsRow.classList.add('hidden');
  }
  
  // Mostrar a seção selecionada
  const section = $(`#view-${viewName}`);
  if (section) {
    section.classList.remove('hidden');
  }
}

// Configurar cliques nos botões de navegação
document.querySelectorAll('.nav-item').forEach(button => {
  button.addEventListener('click', function() {
    console.log('Clicou em:', this.getAttribute('data-view'));
    
    // Remover active de todos
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Adicionar active ao clicado
    this.classList.add('active');
    
    // Mudar view
    const viewName = this.getAttribute('data-view');
    switchView(viewName);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AUTENTICAÇÃO
// ────────────────────────────────────────────────────────────────────────────

function setMessage(id, message, isError = false) {
  const el = $(`#${id}`);
  if (el) {
    el.textContent = message;
    el.style.color = isError ? '#d94f4f' : '#66758a';
  }
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
  if (isAuthenticated) {
    switchView('dashboard');
  }
}

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
  startPolling();
  initializeSocket();
  loadConversations();
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
  startPolling();
  initializeSocket();
  loadConversations();
}

function logout() {
  state.token = null;
  state.user = null;
  state.attendances = [];
  state.users = [];
  state.conversations = [];
  state.currentMessages = [];
  localStorage.removeItem('formis_token');
  localStorage.removeItem('formis_user');
  if (refreshInterval) clearInterval(refreshInterval);
  if (socket) socket.disconnect();
  setAuthenticated(false);
}

// ────────────────────────────────────────────────────────────────────────────
// FORMULÁRIOS DE AUTENTICAÇÃO
// ────────────────────────────────────────────────────────────────────────────

$('#tabLogin').addEventListener('click', () => {
  $('#tabLogin').classList.add('active');
  $('#tabRegister').classList.remove('active');
  $('#loginForm').classList.add('active');
  $('#registerForm').classList.remove('active');
});

$('#tabRegister').addEventListener('click', () => {
  $('#tabRegister').classList.add('active');
  $('#tabLogin').classList.remove('active');
  $('#registerForm').classList.add('active');
  $('#loginForm').classList.remove('active');
});

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

// ────────────────────────────────────────────────────────────────────────────
// MÉTRICAS E RENDERIZAÇÃO
// ────────────────────────────────────────────────────────────────────────────

function animateValue(id, start, end, duration = 500) {
  const obj = $(`#${id}`);
  if (!obj) return;
  if (start === end) {
    obj.textContent = end;
    return;
  }
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.textContent = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function renderMetrics() {
  const total = state.attendances.length;
  const progress = state.attendances.filter((i) => i.status === 'in_progress').length;
  const resolved = state.attendances.filter((i) => i.status === 'resolved').length;
  
  const prevTotal = parseInt($('#metricTotal').textContent) || 0;
  const prevProgress = parseInt($('#metricProgress').textContent) || 0;
  const prevResolved = parseInt($('#metricResolved').textContent) || 0;

  animateValue('metricTotal', prevTotal, total);
  animateValue('metricProgress', prevProgress, progress);
  animateValue('metricResolved', prevResolved, resolved);
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
    return `<tr>
      <td><strong>${attendance.customerName || 'Cliente sem nome'}</strong><br><small>${attendance.customerPhone}</small></td>
      <td>${channelLabels[attendance.channel] || attendance.channel}</td>
      <td><span class="badge ${attendance.status}">${statusLabels[attendance.status] || attendance.status}</span></td>
      <td>${collaborator}</td>
      <td>${startedAt}</td>
    </tr>`;
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
    list.innerHTML = '<p class="empty-state">Nenhum colaborador encontrado.</p>';
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

// ────────────────────────────────────────────────────────────────────────────
// CARREGAMENTO DE DADOS
// ────────────────────────────────────────────────────────────────────────────

async function loadAttendances() {
  if (!state.token) return;
  try {
    const status = $('#statusFilter')?.value || '';
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await request(`/api/attendances${query}`, { headers: authHeaders() });
    state.attendances = data.attendances || [];
    renderAttendances();
  } catch (error) {
    console.error('Erro ao carregar atendimentos:', error);
  }
}

async function loadUsers() {
  if (!state.token) return;
  try {
    const data = await request('/api/users', { headers: authHeaders() });
    state.users = data.users || [];
    renderUsers();
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    state.users = [];
    renderUsers();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FORMULÁRIOS DO DASHBOARD
// ────────────────────────────────────────────────────────────────────────────

$('#attendanceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('.primary-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Registrando...';
  submitBtn.disabled = true;
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
    submitBtn.textContent = '✓ Registrado';
    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }, 1500);
  } catch (error) {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    alert(error.message);
  }
});

$('#userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('.primary-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Adicionando...';
  submitBtn.disabled = true;
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
    submitBtn.textContent = '✓ Adicionado';
    setMessage('userMessage', 'Colaborador adicionado com sucesso!');
    await loadUsers();
    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }, 1500);
  } catch (error) {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    setMessage('userMessage', error.message, true);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POLLING DE DADOS
// ────────────────────────────────────────────────────────────────────────────

let refreshInterval;

function startPolling() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {
    await loadAttendances();
  }, 30000);
}

// ────────────────────────────────────────────────────────────────────────────
// CHAT EM TEMPO REAL
// ────────────────────────────────────────────────────────────────────────────

let socket = null;
let currentChatId = null;

// Inicializar Socket.io
function initializeSocket() {
  if (!state.token) return;
  
  if (typeof io === 'undefined') {
    console.warn('Socket.io não está carregado');
    return;
  }

  socket = io(API_BASE, {
    auth: {
      token: state.token
    }
  });

  socket.on('connect', () => {
    console.log('Conectado ao servidor via WebSocket');
    if (state.user) {
      socket.emit('authenticate', state.token);
      socket.emit('join_dashboard', state.user.rootPhone);
    }
  });

  socket.on('authenticated', (data) => {
    console.log('Autenticação no socket:', data);
  });

  socket.on('new_message', (message) => {
    console.log('Nova mensagem recebida:', message);
    if (currentChatId === message.attendance) {
      renderMessageInChat(message);
    }
  });

  socket.on('user_typing', (data) => {
    console.log('Usuário digitando:', data);
  });

  socket.on('attendance_status_changed', (data) => {
    console.log('Status do atendimento alterado:', data);
  });

  socket.on('disconnect', () => {
    console.log('Desconectado do servidor');
  });
}

// Carregar conversas ativas
async function loadConversations() {
  if (!state.token) return;
  try {
    const data = await request('/api/chat/conversations', { headers: authHeaders() });
    state.conversations = data.conversations || [];
    renderConversations();
  } catch (error) {
    console.error('Erro ao carregar conversas:', error);
  }
}

// Renderizar lista de conversas
function renderConversations() {
  const list = $('#conversationList');
  if (!state.conversations || state.conversations.length === 0) {
    list.innerHTML = '<p class="empty-state">Nenhuma conversa ativa.</p>';
    return;
  }

  list.innerHTML = state.conversations.map((conv) => `
    <div class="conversation-item ${currentChatId === conv._id ? 'active' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-conversation-id="${conv._id}">
      <div class="conversation-header">
        <p class="conversation-name">${conv.customerName || 'Cliente'}</p>
        <span class="conversation-time">${new Date(conv.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p class="conversation-preview">${conv.customerPhone}</p>
    </div>
  `).join('');

  // Adicionar listeners aos items de conversa
  document.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => {
      const conversationId = item.getAttribute('data-conversation-id');
      openConversation(conversationId);
    });
  });
}

// Abrir uma conversa
async function openConversation(conversationId) {
  currentChatId = conversationId;

  // Atualizar UI
  document.querySelectorAll('.conversation-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-conversation-id="${conversationId}"]`)?.classList.add('active');

  // Mostrar janela de chat
  $('#chatWindow').querySelector('.chat-empty-state').classList.add('hidden');
  $('#activeChat').classList.remove('hidden');

  // Encontrar a conversa nos dados
  const conversation = state.conversations.find(c => c._id === conversationId);
  if (conversation) {
    $('#activeChatName').textContent = conversation.customerName || 'Cliente';
    $('#activeChatAvatar').textContent = (conversation.customerName || 'C')[0].toUpperCase();
  }

  // Carregar mensagens
  await loadChatMessages(conversationId);

  // Entrar na sala do chat
  if (socket) {
    socket.emit('join_chat', conversationId);
  }

  // Marcar como lido
  try {
    await request(`/api/chat/messages/${conversationId}/read`, {
      method: 'PUT',
      headers: authHeaders()
    });
  } catch (error) {
    console.error('Erro ao marcar como lido:', error);
  }
}

// Carregar mensagens de uma conversa
async function loadChatMessages(conversationId) {
  try {
    const data = await request(`/api/chat/messages/${conversationId}`, { headers: authHeaders() });
    state.currentMessages = data.messages || [];
    renderChatMessages();
    setTimeout(() => {
      const messagesDiv = $('#chatMessages');
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 100);
  } catch (error) {
    console.error('Erro ao carregar mensagens:', error);
  }
}

// Renderizar mensagens no chat
function renderChatMessages() {
  const messagesDiv = $('#chatMessages');
  if (!state.currentMessages || state.currentMessages.length === 0) {
    messagesDiv.innerHTML = '<p class="empty-state">Nenhuma mensagem ainda.</p>';
    return;
  }

  messagesDiv.innerHTML = state.currentMessages.map((msg) => {
    const isOwn = msg.senderType === 'collaborator';
    const time = new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    if (msg.type === 'pabx_call') {
      return `
        <div class="message system">
          <div class="message-bubble">
            📞 ${msg.content}
          </div>
          <div class="message-time">${time}</div>
        </div>
      `;
    }

    return `
      <div class="message ${isOwn ? 'own' : 'other'}">
        <div class="message-bubble">${escapeHtml(msg.content)}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
  }).join('');
}

// Renderizar uma mensagem nova no chat
function renderMessageInChat(message) {
  const messagesDiv = $('#chatMessages');
  const isOwn = message.senderType === 'collaborator';
  const time = new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let html;
  if (message.type === 'pabx_call') {
    html = `
      <div class="message system">
        <div class="message-bubble">
          📞 ${message.content}
        </div>
        <div class="message-time">${time}</div>
      </div>
    `;
  } else {
    html = `
      <div class="message ${isOwn ? 'own' : 'other'}">
        <div class="message-bubble">${escapeHtml(message.content)}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
  }

  messagesDiv.innerHTML += html;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ────────────────────────────────────────────────────────────────────────────
// ENVIO DE MENSAGENS (APRIMORADO)
// ────────────────────────────────────────────────────────────────────────────

let isSendingMessage = false;

function sendMessage() {
  const input = $('#chatInput');
  const content = input.value.trim();

  if (!content || !currentChatId || isSendingMessage) return;

  isSendingMessage = true;
  const sendBtn = $('#sendMsgBtn');
  const originalText = sendBtn.textContent;
  sendBtn.disabled = true;

  // Renderizar mensagem localmente de forma imediata (otimismo)
  const tempMessage = {
    _id: 'temp_' + Date.now(),
    content: content,
    senderType: 'collaborator',
    createdAt: new Date(),
    type: 'text'
  };
  renderMessageInChat(tempMessage);
  input.value = '';
  input.focus();

  // Enviar para o servidor
  request(`/api/chat/messages/${currentChatId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ content, type: 'text' })
  })
    .then((data) => {
      console.log('Mensagem enviada com sucesso:', data.message);
    })
    .catch((error) => {
      console.error('Erro ao enviar mensagem:', error);
      const messagesDiv = $('#chatMessages');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message system';
      errorMsg.innerHTML = `
        <div class="message-bubble" style="color: #d94f4f;">
          ⚠ Erro ao enviar: ${error.message}
        </div>
      `;
      messagesDiv.appendChild(errorMsg);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    })
    .finally(() => {
      isSendingMessage = false;
      sendBtn.disabled = false;
      sendBtn.textContent = originalText;
    });
}

// Enviar ao clicar no botão
$('#sendMsgBtn').addEventListener('click', (e) => {
  e.preventDefault();
  sendMessage();
});

// Enviar ao pressionar Enter (Shift+Enter para quebra de linha)
$('#chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Emitir evento de digitação
let typingTimeout;
$('#chatInput').addEventListener('input', () => {
  if (socket && currentChatId) {
    socket.emit('typing', currentChatId);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('stop_typing', currentChatId);
    }, 3000);
  }
});

// Parar de digitar ao sair do input
$('#chatInput').addEventListener('blur', () => {
  if (socket && currentChatId) {
    socket.emit('stop_typing', currentChatId);
  }
});

// Buscar conversas
$('#chatSearch').addEventListener('input', async (e) => {
  const query = e.target.value.trim();
  if (!query) {
    loadConversations();
    return;
  }

  try {
    const data = await request(`/api/chat/conversations/search?query=${encodeURIComponent(query)}`, {
      headers: authHeaders()
    });
    state.conversations = data.conversations || [];
    renderConversations();
  } catch (error) {
    console.error('Erro ao buscar conversas:', error);
  }
});

// Função auxiliar para escapar HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Inicializar chat ao fazer login
if (state.token && state.user) {
  initializeSocket();
  loadConversations();
}

// ────────────────────────────────────────────────────────────────────────────
// NOVA CONVERSA
// ────────────────────────────────────────────────────────────────────────────

// Abrir modal de nova conversa
$('#newChatBtn').addEventListener('click', () => {
  $('#newChatModal').classList.remove('hidden');
  $('#newChatName').focus();
});

// Fechar modal
$('#closeNewChatModal').addEventListener('click', () => {
  $('#newChatModal').classList.add('hidden');
  $('#newChatForm').reset();
});

// Fechar modal ao clicar fora
$('#newChatModal').addEventListener('click', (e) => {
  if (e.target === $('#newChatModal')) {
    $('#newChatModal').classList.add('hidden');
    $('#newChatForm').reset();
  }
});

// Criar nova conversa
$('#newChatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#newChatName').value.trim();
  const phone = $('#newChatPhone').value.trim();

  if (!phone) {
    alert('Por favor, digite o telefone do cliente.');
    return;
  }

  const submitBtn = e.target.querySelector('.primary-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Criando...';
  submitBtn.disabled = true;

  try {
    const response = await request('/api/attendances', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        customerName: name || 'Cliente',
        customerPhone: phone,
        channel: 'chat',
        status: 'open',
        notes: 'Atendimento iniciado via chat'
      })
    });

    $('#newChatModal').classList.add('hidden');
    $('#newChatForm').reset();

    await loadConversations();

    if (response._id) {
      openConversation(response._id);
    }

    submitBtn.textContent = '✓ Criado';
    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }, 1500);
  } catch (error) {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    alert('Erro ao criar conversa: ' + error.message);
  }
});


// ────────────────────────────────────────────────────────────────────────────
// CHAT INTERNO (COLABORADORES)
// ────────────────────────────────────────────────────────────────────────────

let currentChatType = 'external'; // 'external' para clientes, 'internal' para equipe
let currentInternalChatUserId = null;

// Alternar entre abas de chat
document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const chatType = tab.getAttribute('data-chat-type');
    
    // Atualizar abas
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Alternar visibilidade dos headers
    if (chatType === 'external') {
      $('#externalChatHeader').classList.remove('hidden');
      $('#internalChatHeader').classList.add('hidden');
      $('#conversationList').classList.remove('hidden');
      $('#internalContactList').classList.add('hidden');
      currentChatType = 'external';
    } else {
      $('#externalChatHeader').classList.add('hidden');
      $('#internalChatHeader').classList.remove('hidden');
      $('#conversationList').classList.add('hidden');
      $('#internalContactList').classList.remove('hidden');
      currentChatType = 'internal';
      loadInternalContacts();
    }
    
    // Resetar chat ativo
    $('#chatWindow').querySelector('.chat-empty-state').classList.remove('hidden');
    $('#activeChat').classList.add('hidden');
    currentChatId = null;
    currentInternalChatUserId = null;
  });
});

// Carregar contatos internos (colaboradores)
async function loadInternalContacts() {
  if (!state.token) return;
  try {
    const data = await request('/api/users', { headers: authHeaders() });
    state.internalContacts = data.users || [];
    renderInternalContacts();
  } catch (error) {
    console.error('Erro ao carregar contatos internos:', error);
  }
}

// Renderizar contatos internos
function renderInternalContacts() {
  const list = $('#internalContactList');
  if (!state.internalContacts || state.internalContacts.length === 0) {
    list.innerHTML = '<p class="empty-state">Nenhum colaborador encontrado.</p>';
    return;
  }

  // Filtrar para não mostrar o usuário atual
  const otherUsers = state.internalContacts.filter(u => u._id !== state.user?.id);

  list.innerHTML = otherUsers.map((user) => {
    const initials = initials(user.name);
    const isOnline = Math.random() > 0.5; // Placeholder - será atualizado via Socket.io
    
    return `
      <div class="internal-contact ${currentInternalChatUserId === user._id ? 'active' : ''}" data-user-id="${user._id}">
        <div class="contact-avatar ${isOnline ? 'online' : 'offline'}">
          ${initials}
        </div>
        <div class="contact-info">
          <p class="contact-name">${user.name}</p>
          <p class="contact-status ${isOnline ? 'online' : 'offline'}">
            ${isOnline ? '● Online' : '● Offline'}
          </p>
        </div>
      </div>
    `;
  }).join('');

  // Adicionar listeners aos contatos
  document.querySelectorAll('.internal-contact').forEach(item => {
    item.addEventListener('click', () => {
      const userId = item.getAttribute('data-user-id');
      openInternalChat(userId);
    });
  });
}

// Abrir chat privado com um colaborador
async function openInternalChat(userId) {
  currentInternalChatUserId = userId;

  // Atualizar UI
  document.querySelectorAll('.internal-contact').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');

  // Mostrar janela de chat
  $('#chatWindow').querySelector('.chat-empty-state').classList.add('hidden');
  $('#activeChat').classList.remove('hidden');

  // Encontrar o usuário nos dados
  const user = state.internalContacts.find(u => u._id === userId);
  if (user) {
    $('#activeChatName').textContent = user.name;
    $('#activeChatAvatar').textContent = initials(user.name);
    $('#activeChatStatus').textContent = 'Colaborador';
  }

  // Carregar histórico de mensagens internas
  await loadInternalChatMessages(userId);

  // Entrar na sala de chat privado
  if (socket) {
    socket.emit('join_private_chat', userId);
  }
}

// Carregar mensagens de chat privado
async function loadInternalChatMessages(userId) {
  try {
    const data = await request(`/api/chat/private/${userId}`, { headers: authHeaders() });
    state.currentMessages = data.messages || [];
    renderChatMessages();
    setTimeout(() => {
      const messagesDiv = $('#chatMessages');
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 100);
  } catch (error) {
    console.error('Erro ao carregar mensagens privadas:', error);
  }
}

// Enviar mensagem privada (modificar função existente)
const originalSendMessage = window.sendMessage;
window.sendMessage = function() {
  if (currentChatType === 'internal' && currentInternalChatUserId) {
    sendInternalMessage();
  } else {
    originalSendMessage();
  }
};

function sendInternalMessage() {
  const input = $('#chatInput');
  const content = input.value.trim();

  if (!content || !currentInternalChatUserId || isSendingMessage) return;

  isSendingMessage = true;
  const sendBtn = $('#sendMsgBtn');
  const originalText = sendBtn.textContent;
  sendBtn.disabled = true;

  // Renderizar mensagem localmente
  const tempMessage = {
    _id: 'temp_' + Date.now(),
    content: content,
    senderType: 'collaborator',
    createdAt: new Date(),
    type: 'text'
  };
  renderMessageInChat(tempMessage);
  input.value = '';
  input.focus();

  // Enviar para o servidor
  request(`/api/chat/private/${currentInternalChatUserId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ content, type: 'text' })
  })
    .then((data) => {
      console.log('Mensagem privada enviada:', data.message);
    })
    .catch((error) => {
      console.error('Erro ao enviar mensagem privada:', error);
      const messagesDiv = $('#chatMessages');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message system';
      errorMsg.innerHTML = `
        <div class="message-bubble" style="color: #d94f4f;">
          ⚠ Erro ao enviar: ${error.message}
        </div>
      `;
      messagesDiv.appendChild(errorMsg);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    })
    .finally(() => {
      isSendingMessage = false;
      sendBtn.disabled = false;
      sendBtn.textContent = originalText;
    });
}

// Buscar contatos internos
$('#internalSearch').addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  
  document.querySelectorAll('.internal-contact').forEach(item => {
    const name = item.querySelector('.contact-name').textContent.toLowerCase();
    if (name.includes(query)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
});

// Adicionar estado de contatos internos
state.internalContacts = [];
state.onlineUsers = {};

// Ouvir eventos de presença do Socket.io
if (socket) {
  socket.on('user_online', (data) => {
    state.onlineUsers[data.userId] = true;
    updateContactPresence(data.userId, true);
  });

  socket.on('user_offline', (data) => {
    delete state.onlineUsers[data.userId];
    updateContactPresence(data.userId, false);
  });

  socket.on('private_message', (message) => {
    if (currentChatType === 'internal' && currentInternalChatUserId === message.senderId) {
      renderMessageInChat(message);
    }
  });
}

// Atualizar presença de um contato
function updateContactPresence(userId, isOnline) {
  const contactElement = document.querySelector(`[data-user-id="${userId}"]`);
  if (contactElement) {
    const avatar = contactElement.querySelector('.contact-avatar');
    const status = contactElement.querySelector('.contact-status');
    
    if (isOnline) {
      avatar.classList.add('online');
      avatar.classList.remove('offline');
      status.classList.add('online');
      status.classList.remove('offline');
      status.textContent = '● Online';
    } else {
      avatar.classList.remove('online');
      avatar.classList.add('offline');
      status.classList.remove('online');
      status.classList.add('offline');
      status.textContent = '● Offline';
    }
  }
}


// ────────────────────────────────────────────────────────────────────────────
// CONTROLE DE ACESSO (ADMIN)
// ────────────────────────────────────────────────────────────────────────────

function isAdmin() {
  return state.user && state.user.role === 'admin';
}

function updateAccessControl() {
  const isUserAdmin = isAdmin();
  
  // Ocultar/mostrar formulário de novo usuário
  const userForm = $('#userForm');
  if (userForm) {
    userForm.style.display = isUserAdmin ? 'block' : 'none';
  }

  // Ocultar/mostrar botões de remover usuário
  document.querySelectorAll('.btn-remove-user').forEach(btn => {
    btn.style.display = isUserAdmin ? 'inline-block' : 'none';
  });

  // Ocultar/mostrar aba de Equipe se não for admin
  const teamNavItem = document.querySelector('[data-view="team"]');
  if (teamNavItem) {
    teamNavItem.style.display = isUserAdmin ? 'block' : 'none';
  }
}

// Chamar ao fazer login
const originalSetAuthenticated = window.setAuthenticated;
window.setAuthenticated = function(isAuthenticated) {
  originalSetAuthenticated(isAuthenticated);
  if (isAuthenticated) {
    setTimeout(updateAccessControl, 100);
  }
};

// Chamar ao renderizar usuários
const originalRenderUsers = window.renderUsers;
window.renderUsers = function() {
  originalRenderUsers();
  if (isAdmin()) {
    // Adicionar botões de remover a cada usuário
    document.querySelectorAll('.team-member').forEach((member, index) => {
      if (!member.querySelector('.btn-remove-user')) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-user secondary-btn';
        removeBtn.textContent = '✕ Remover';
        removeBtn.style.marginTop = '8px';
        removeBtn.addEventListener('click', () => {
          const user = state.users[index];
          if (user) {
            removeUser(user._id, user.name);
          }
        });
        member.appendChild(removeBtn);
      }
    });
  }
};

// Função para remover usuário
async function removeUser(userId, userName) {
  if (!confirm(`Tem certeza que deseja remover o colaborador "${userName}"?`)) {
    return;
  }

  try {
    await request(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    alert('Colaborador removido com sucesso!');
    await loadUsers();
  } catch (error) {
    alert('Erro ao remover colaborador: ' + error.message);
  }
}

// Atualizar controle de acesso ao carregar a página
if (state.user) {
  updateAccessControl();
}


// ────────────────────────────────────────────────────────────────────────────
// ENVIO DE MENSAGENS WHATSAPP
// ────────────────────────────────────────────────────────────────────────────

// Verificar se o atendimento atual é via WhatsApp
function isWhatsappChat() {
  if (!currentChatId) return false;
  const attendance = state.attendances.find(a => a._id === currentChatId);
  return attendance && attendance.channel === 'whatsapp';
}

// Modificar a função de envio para suportar WhatsApp
const originalSendMessage = window.sendMessage;
window.sendMessage = function() {
  if (currentChatType === 'external' && isWhatsappChat()) {
    sendWhatsappMessage();
  } else if (currentChatType === 'internal' && currentInternalChatUserId) {
    sendInternalMessage();
  } else {
    originalSendMessage();
  }
};

function sendWhatsappMessage() {
  const input = $('#chatInput');
  const content = input.value.trim();

  if (!content || !currentChatId || isSendingMessage) return;

  isSendingMessage = true;
  const sendBtn = $('#sendMsgBtn');
  const originalText = sendBtn.textContent;
  sendBtn.disabled = true;

  // Renderizar mensagem localmente
  const tempMessage = {
    _id: 'temp_' + Date.now(),
    content: content,
    senderType: 'collaborator',
    createdAt: new Date(),
    type: 'text'
  };
  renderMessageInChat(tempMessage);
  input.value = '';
  input.focus();

  // Enviar para o servidor (que por sua vez envia para WhatsApp)
  request(`/api/whatsapp/send/${currentChatId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ content, type: 'text' })
  })
    .then((data) => {
      console.log('Mensagem WhatsApp enviada:', data.message);
    })
    .catch((error) => {
      console.error('Erro ao enviar mensagem WhatsApp:', error);
      const messagesDiv = $('#chatMessages');
      const errorMsg = document.createElement('div');
      errorMsg.className = 'message system';
      errorMsg.innerHTML = `
        <div class="message-bubble" style="color: #d94f4f;">
          ⚠ Erro ao enviar via WhatsApp: ${error.message}
        </div>
      `;
      messagesDiv.appendChild(errorMsg);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    })
    .finally(() => {
      isSendingMessage = false;
      sendBtn.disabled = false;
      sendBtn.textContent = originalText;
    });
}

// Adicionar indicador visual de canal WhatsApp nas mensagens
const originalRenderMessageInChat = window.renderMessageInChat;
window.renderMessageInChat = function(message) {
  // Adicionar informação do canal se for WhatsApp
  if (isWhatsappChat() && message.senderType === 'customer') {
    message.channelIcon = '💬 WhatsApp';
  }
  originalRenderMessageInChat(message);
};
