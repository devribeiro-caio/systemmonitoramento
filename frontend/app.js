const API_BASE = window.location.port === '3000' ? '' : 'http://127.0.0.1:3000';

const state = {
  token: localStorage.getItem('formis_token'),
  user: JSON.parse(localStorage.getItem('formis_user') || 'null'),
  attendances: [],
  users: [],
  contacts: [],
  messages: [],
  evaluations: [],
  internalChatUsers: [],
  internalChatMessages: [],
  selectedContactId: null,
  ticketFilter: 'open',
  ticketSearch: '',
  knownIncomingMessageIds: new Set()
};

let messagesInitialized = false;

const statusLabels = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  lost: 'Perdido'
};

const channelLabels = {
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  pabx: 'PABX',
  chat: 'Chat',
  email: 'E-mail',
  system: 'Sistema',
  other: 'Outro'
};

const $ = (selector) => document.querySelector(selector);

function notifySound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(1174, context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
  } catch (error) {
    // Audio can be blocked until a user interacts with the page.
  }
}

function deliveryTicks(status) {
  if (status === 'failed') return '<span class="delivery-ticks pending">✓</span>';
  if (['sent', 'received', 'answered', 'registered'].includes(status)) {
    return '<span class="delivery-ticks delivered">✓✓</span>';
  }
  return '<span class="delivery-ticks pending">✓</span>';
}

function messageStatusLabel(message) {
  if (message.status === 'failed') {
    const error = message.metadata?.delivery?.error;
    return error ? `nao enviado: ${error}` : 'nao enviado';
  }

  return message.status;
}

function setCustomerChatMessage(text) {
  const message = $('#customerChatMessage');
  if (message) message.textContent = text;
}

function getSelectedContact() {
  const contactId = state.selectedContactId || $('#customerChatContact')?.value;
  return state.contacts.find((item) => item._id === contactId);
}

function setTicketActionMessage(text) {
  setCustomerChatMessage(text);
  const meta = $('#conversationMeta');
  const contact = getSelectedContact();

  if (meta && contact) {
    meta.textContent = `${contact.phone} - ${text}`;
  } else if (meta && text) {
    meta.textContent = text;
  }
}

function updateTicketButtons() {
  const contact = getSelectedContact();
  const status = contact?.status || 'open';

  $('#returnTicketBtn')?.classList.toggle('active', status === 'open');
  $('#pauseTicketBtn')?.classList.toggle('active', status === 'paused');
  $('#finishTicketBtn')?.classList.toggle('active', status === 'resolved');
}

function closeFloatingChatPanels(exceptId = '') {
  ['emojiPanel', 'attachPanel', 'chatMenu'].forEach((id) => {
    if (id !== exceptId) $(`#${id}`)?.classList.add('hidden');
  });
}

function ensureLiveDataPanels() {
  if ($('#contactList') && $('#messageList')) return;

  const content = $('#appContent');
  const metrics = content?.querySelector('.metrics');
  if (!content || !metrics) return;

  const section = document.createElement('section');
  section.className = 'workspace data-space';
  section.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Base real</p>
          <h2>Contatos recentes</h2>
        </div>
      </div>
      <div class="team-list" id="contactList">
        <p class="empty-state">Faça login para carregar contatos.</p>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Histórico</p>
          <h2>Mensagens e eventos</h2>
        </div>
      </div>
      <div class="team-list" id="messageList">
        <p class="empty-state">Faça login para carregar mensagens.</p>
      </div>
    </div>
  `;

  metrics.insertAdjacentElement('afterend', section);
}

function ensureViewStructure() {
  const appContent = $('#appContent');
  if (!appContent || appContent.dataset.viewsReady === 'true') return;
  if (appContent.querySelector('.app-view')) {
    appContent.dataset.viewsReady = 'true';
    return;
  }

  const children = Array.from(appContent.children);
  const metrics = appContent.querySelector('.metrics');
  const dataSpace = appContent.querySelector('.data-space');
  const workspaces = appContent.querySelectorAll('.workspace');
  const attendanceWorkspace = Array.from(workspaces).find((section) => section.querySelector('#attendanceForm'));
  const teamWorkspace = $('#teamSection');

  const dashboardView = document.createElement('div');
  dashboardView.className = 'app-view active';
  dashboardView.dataset.viewPanel = 'dashboard';

  if (metrics) dashboardView.appendChild(metrics);
  if (dataSpace) dashboardView.appendChild(dataSpace);

  const attendancesView = document.createElement('div');
  attendancesView.className = 'app-view';
  attendancesView.dataset.viewPanel = 'attendances';
  if (attendanceWorkspace) attendancesView.appendChild(attendanceWorkspace);

  const chatView = document.createElement('div');
  chatView.className = 'app-view';
  chatView.dataset.viewPanel = 'chat';
  chatView.innerHTML = `
    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Histórico</p>
            <h2>Chat e eventos reais</h2>
          </div>
        </div>
        <div class="team-list" id="chatMessageList"></div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Contatos</p>
            <h2>Base de clientes</h2>
          </div>
        </div>
        <div class="team-list" id="chatContactList"></div>
      </div>
    </section>
  `;

  const settingsView = document.createElement('div');
  settingsView.className = 'app-view';
  settingsView.dataset.viewPanel = 'settings';
  if (teamWorkspace) settingsView.appendChild(teamWorkspace);

  children.forEach((child) => child.remove());
  appContent.append(dashboardView, attendancesView, chatView, settingsView);
  appContent.dataset.viewsReady = 'true';
}

function setView(viewName) {
  const normalizedView = viewName === 'team' ? 'settings' : viewName;
  const view = ['dashboard', 'evaluations', 'attendances', 'chat', 'settings'].includes(normalizedView)
    ? normalizedView
    : 'dashboard';

  document.querySelectorAll('.nav-item').forEach((item) => {
    const itemView = item.dataset.view === 'team' ? 'settings' : item.dataset.view;
    item.classList.toggle('active', itemView === view);
  });

  document.querySelectorAll('.app-view').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.viewPanel === view);
  });
}

function isAdmin() {
  return state.user?.role === 'admin';
}

function applyRolePermissions() {
  document.querySelectorAll('[data-view="dashboard"], [data-view="evaluations"], [data-view="settings"]').forEach((item) => {
    item.classList.toggle('hidden', !isAdmin());
  });

  if (!isAdmin() && ['dashboard', 'evaluations', 'settings'].includes(document.querySelector('.app-view.active')?.dataset.viewPanel)) {
    setView('attendances');
  }
}

function setMessage(message, isError = false) {
  const element = $('#authMessage');
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? '#d94f4f' : '#66758a';
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
    throw new Error(data.message || 'Não foi possível comunicar com a API.');
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
    $('#logoutBtn')?.classList.add('hidden');
    return;
  }

  $('#userName').textContent = state.user.name;
  $('#userRole').textContent = `${state.user.role} - ${state.user.rootPhone}`;
  $('#userInitials').textContent = initials(state.user.name);
  $('#connectionStatus').textContent = 'Conectado à API';
  $('#logoutBtn')?.classList.remove('hidden');
}

function setAuthenticated(isAuthenticated) {
  $('#authPanel').classList.toggle('hidden', isAuthenticated);
  $('#appContent').classList.toggle('hidden', !isAuthenticated);
  updateUserUI();
  applyRolePermissions();
}

function renderMetrics() {
  const total = state.attendances.length;
  const progress = state.attendances.filter((item) => item.status === 'in_progress').length;
  const resolved = state.attendances.filter((item) => item.status === 'resolved').length;

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
  if (!list) return;

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
        <small>${user.email} - ${user.phone || 'sem telefone'} - Ramal ${user.extension || '--'}</small>
      </div>
      <span class="role-pill">${user.role}</span>
    </article>
  `).join('');
}

function renderContacts() {
  const list = $('#contactList');
  if (!list) return;

  if (!state.contacts.length) {
    list.innerHTML = '<p class="empty-state">Nenhum contato real encontrado ainda.</p>';
    return;
  }

  list.innerHTML = state.contacts.map((contact) => `
    <article class="team-member">
      <div>
        <strong>${contact.name || 'Contato sem nome'}</strong>
        <small>${contact.phone} - ${contact.source}</small>
      </div>
      <span class="list-meta">${new Date(contact.lastInteractionAt).toLocaleString('pt-BR')}</span>
    </article>
  `).join('');

  const chatList = $('#chatContactList');
  if (chatList) {
    chatList.innerHTML = list.innerHTML;
  }

  const customerSelect = $('#customerChatContact');
  if (customerSelect) {
    const chatContacts = state.contacts.filter((contact) => {
      if (contact.source === 'wide_voice') return false;
      if (contact.remoteJid && !contact.remoteJid.endsWith('@s.whatsapp.net')) return false;
      return contact.phone && contact.phone !== '0';
    });
    customerSelect.innerHTML = chatContacts.length
      ? chatContacts.map((contact) => `<option value="${contact._id}" data-phone="${contact.phone}">${contact.name || contact.phone} - ${contact.phone}</option>`).join('')
      : '<option value="">Nenhum cliente cadastrado</option>';
  }

  const ticketList = $('#customerTicketList');
  if (ticketList) {
    const chatContacts = state.contacts.filter((contact) => {
      if (contact.source === 'wide_voice') return false;
      if (contact.remoteJid && !contact.remoteJid.endsWith('@s.whatsapp.net')) return false;
      return contact.phone && contact.phone !== '0';
    });
    const filteredContacts = state.ticketFilter === 'all'
      ? chatContacts
      : chatContacts.filter((contact) => (contact.status || 'open') === state.ticketFilter);
    const visibleContacts = state.ticketSearch
      ? filteredContacts.filter((contact) => `${contact.name || ''} ${contact.phone || ''}`.toLowerCase().includes(state.ticketSearch.toLowerCase()))
      : filteredContacts;

    ticketList.innerHTML = visibleContacts.length
      ? visibleContacts.map((contact, index) => {
          const lastMessage = state.messages.find((message) => message.phone === contact.phone);
          const avatar = contact.profilePictureUrl
            ? `<img class="ticket-avatar-img" src="${contact.profilePictureUrl}" alt="${contact.name || contact.phone}">`
            : `<span class="ticket-avatar">${initials(contact.name || contact.phone)}</span>`;
          return `
            <button class="ticket-item ${contact._id === state.selectedContactId || (!state.selectedContactId && index === 0) ? 'active' : ''}" type="button" data-contact="${contact._id}">
              ${avatar}
              <span>
                <strong>${contact.name || contact.phone}</strong>
                <small>${lastMessage?.content || contact.phone}</small>
                <em>${contact.status || 'open'}</em>
              </span>
            </button>
          `;
        }).join('')
      : '<p class="empty-state">Nenhum ticket nesta fila.</p>';

    ticketList.querySelectorAll('.ticket-item').forEach((button) => {
      button.addEventListener('click', () => selectCustomerTicket(button.dataset.contact));
    });
  }

  const chatContacts = state.contacts.filter((contact) => {
    if (contact.source === 'wide_voice') return false;
    if (contact.remoteJid && !contact.remoteJid.endsWith('@s.whatsapp.net')) return false;
    return contact.phone && contact.phone !== '0';
  });
  const filteredContacts = state.ticketFilter === 'all'
    ? chatContacts
    : chatContacts.filter((contact) => (contact.status || 'open') === state.ticketFilter);
  const firstVisible = state.ticketSearch
    ? filteredContacts.find((contact) => `${contact.name || ''} ${contact.phone || ''}`.toLowerCase().includes(state.ticketSearch.toLowerCase()))
    : filteredContacts[0];

  if (firstVisible && customerSelect && !customerSelect.value) {
    selectCustomerTicket(firstVisible._id);
  } else if (!firstVisible && customerSelect) {
    state.selectedContactId = null;
    customerSelect.value = '';
  }
}

function renderMessages() {
  const list = $('#messageList');
  if (!list) return;

  if (!state.messages.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma mensagem ou evento encontrado ainda.</p>';
    return;
  }

  list.innerHTML = state.messages.map((message) => `
    <article class="team-member">
      <div>
        <strong>${message.contact?.name || message.phone}</strong>
        <small>${channelLabels[message.channel] || message.channel} - ${messageStatusLabel(message)} - ${message.content || 'sem conteúdo'}</small>
      </div>
      <span class="list-meta">${new Date(message.occurredAt).toLocaleString('pt-BR')}</span>
    </article>
  `).join('');

  const chatList = $('#chatMessageList');
  if (chatList) {
    chatList.innerHTML = list.innerHTML;
  }

  renderCustomerChat();
}

function renderCustomerChat() {
  const list = $('#customerChatList');
  const select = $('#customerChatContact');
  if (!list || !select) return;

  const selected = select.options[select.selectedIndex];
  const phone = selected?.dataset.phone;
  const contact = state.contacts.find((item) => item._id === select.value);
  const messages = phone
    ? state.messages
        .filter((message) => message.phone === phone)
        .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
    : [];

  $('#conversationName').textContent = contact?.name || selected?.textContent || 'Selecione um cliente';
  $('#conversationMeta').textContent = contact ? `${contact.phone} - Atendimento WhatsApp` : 'Atendimento WhatsApp';
  updateTicketButtons();
  const avatar = $('#conversationInitials');
  if (avatar) {
    avatar.innerHTML = contact?.profilePictureUrl
      ? `<img class="conversation-avatar-img" src="${contact.profilePictureUrl}" alt="${contact.name || contact.phone}">`
      : initials(contact?.name || contact?.phone || '--');
  }

  if (!messages.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma conversa com este cliente ainda.</p>';
    return;
  }

  list.innerHTML = messages.map((message) => `
    <article class="message-bubble ${message.direction === 'outgoing' ? 'outgoing' : 'incoming'} ${message.status === 'failed' ? 'failed' : ''}" data-message="${message._id}">
      <button class="delete-message-btn" type="button" title="Apagar mensagem">×</button>
      <strong>${message.direction === 'outgoing' ? state.user.name : contact?.name || message.phone}</strong>
      <span>${message.content || 'sem conteúdo'}</span>
      <small>${new Date(message.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${message.direction === 'outgoing' ? deliveryTicks(message.status) : ''}</small>
      ${message.status === 'failed' ? `<em class="message-error">${messageStatusLabel(message)}</em>` : ''}
    </article>
  `).join('');

  list.querySelectorAll('.delete-message-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.closest('.message-bubble')?.dataset.message;
      if (!id) return;

      await request(`/api/messages/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      await loadMessages();
    });
  });

  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function selectCustomerTicket(contactId) {
  const select = $('#customerChatContact');
  if (!select) return;

  state.selectedContactId = contactId;
  select.value = contactId;
  document.querySelectorAll('.ticket-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.contact === contactId);
  });
  renderCustomerChat();
}

async function updateSelectedTicket(status) {
  const contactId = state.selectedContactId || $('#customerChatContact')?.value;
  const contact = getSelectedContact();

  if (!contactId || !contact) {
    setTicketActionMessage('Selecione um ticket antes de usar esta ação.');
    return;
  }

  const labels = {
    open: 'Ticket retornado para a fila.',
    paused: 'Ticket pausado.',
    resolved: 'Ticket finalizado.'
  };

  setTicketActionMessage('Atualizando ticket...');

  try {
    await request(`/api/contacts/${contactId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });

    contact.status = status;
    state.selectedContactId = contactId;
    renderContacts();
    selectCustomerTicket(contactId);
    setTicketActionMessage(labels[status] || 'Ticket atualizado.');
  } catch (error) {
    setTicketActionMessage(error.message);
  }
}

async function deleteSelectedTicket() {
  const contactId = state.selectedContactId || $('#customerChatContact')?.value;
  const contact = getSelectedContact();

  if (!contactId || !contact) {
    setTicketActionMessage('Selecione um ticket antes de excluir.');
    return;
  }

  setTicketActionMessage('Excluindo ticket...');

  try {
    await request(`/api/contacts/${contactId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    state.selectedContactId = null;
    $('#customerChatContact').value = '';
    await loadContacts();
    renderCustomerChat();
    setTicketActionMessage('Ticket excluido.');
  } catch (error) {
    setTicketActionMessage(error.message);
  }
}

function renderEvaluationOptions() {
  const select = $('#evaluationAttendance');
  if (!select) return;

  const options = state.attendances.map((attendance) => {
    const label = `${attendance.customerName || 'Cliente'} - ${attendance.customerPhone} - ${statusLabels[attendance.status] || attendance.status}`;
    return `<option value="${attendance._id}">${label}</option>`;
  });

  select.innerHTML = options.length ? options.join('') : '<option value="">Nenhum atendimento disponível</option>';
}

function renderEvaluations() {
  const list = $('#evaluationList');
  if (!list) return;

  if (!state.evaluations.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma avaliação encontrada.</p>';
    return;
  }

  list.innerHTML = state.evaluations.map((evaluation) => `
    <article class="team-member">
      <div>
        <strong>Nota ${evaluation.score} - ${evaluation.collaborator?.name || 'Colaborador'}</strong>
        <small>${evaluation.attendance?.customerName || 'Atendimento'} - ${evaluation.comment || 'sem comentário'}</small>
      </div>
      <span class="list-meta">${new Date(evaluation.createdAt).toLocaleString('pt-BR')}</span>
    </article>
  `).join('');
}

function renderInternalChatUsers() {
  const select = $('#internalChatRecipient');
  if (!select) return;

  select.innerHTML = state.internalChatUsers.length
    ? state.internalChatUsers.map((user) => `<option value="${user._id}">${user.name} - ${user.role}</option>`).join('')
    : '<option value="">Nenhum colaborador disponível</option>';
}

function renderInternalChatMessages() {
  const list = $('#internalChatList');
  if (!list) return;

  if (!state.internalChatMessages.length) {
    list.innerHTML = '<p class="empty-state">Selecione um colaborador para carregar a conversa.</p>';
    return;
  }

  list.innerHTML = state.internalChatMessages.map((message) => `
    <article class="team-member">
      <div>
        <strong>${message.sender?._id === state.user.id ? 'Você' : message.sender?.name || 'Colaborador'}</strong>
        <small>${message.content}</small>
      </div>
      <span class="list-meta">${new Date(message.createdAt).toLocaleString('pt-BR')}</span>
    </article>
  `).join('');
}

async function loadAttendances() {
  if (!state.token) return;

  const status = $('#statusFilter')?.value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request(`/api/attendances${query}`, { headers: authHeaders() });

  state.attendances = data.attendances || [];
  renderAttendances();
  renderEvaluationOptions();
}

async function loadUsers() {
  if (!state.token || !isAdmin()) return;

  try {
    const data = await request('/api/users', { headers: authHeaders() });
    state.users = data.users || [];
    renderUsers();
  } catch (error) {
    state.users = [];
    renderUsers();
  }
}

async function loadContacts() {
  if (!state.token) return;

  const data = await request('/api/contacts', { headers: authHeaders() });
  state.contacts = data.contacts || [];
  renderContacts();
}

async function loadMessages() {
  if (!state.token) return;

  const data = await request('/api/messages', { headers: authHeaders() });
  const previousCount = state.knownIncomingMessageIds.size;
  state.messages = data.messages || [];
  state.messages
    .filter((message) => message.direction === 'incoming')
    .forEach((message) => {
      const id = message._id || `${message.phone}-${message.occurredAt}-${message.content}`;
      state.knownIncomingMessageIds.add(id);
    });

  if (messagesInitialized && state.knownIncomingMessageIds.size > previousCount) {
    notifySound();
  }
  messagesInitialized = true;

  renderMessages();
}

async function loadEvaluations() {
  if (!state.token || !isAdmin()) return;

  const data = await request('/api/evaluations', { headers: authHeaders() });
  state.evaluations = data.evaluations || [];
  renderEvaluations();
}

async function loadInternalChatUsers() {
  if (!state.token) return;

  const data = await request('/api/internal-chat/users', { headers: authHeaders() });
  state.internalChatUsers = data.users || [];
  renderInternalChatUsers();
}

async function loadInternalChatMessages() {
  const recipient = $('#internalChatRecipient')?.value;
  if (!state.token || !recipient) return;

  const data = await request(`/api/internal-chat/messages?withUser=${encodeURIComponent(recipient)}`, {
    headers: authHeaders()
  });
  state.internalChatMessages = data.messages || [];
  renderInternalChatMessages();
}

async function refreshData() {
  await Promise.all([
    loadAttendances(),
    loadUsers(),
    loadContacts(),
    loadMessages(),
    loadEvaluations(),
    loadInternalChatUsers()
  ]);
}

async function syncEvolution() {
  const syncMessage = $('#syncMessage');
  if (syncMessage) syncMessage.textContent = 'Verificando Evolution API...';

  try {
    await request('/api/evolution/status', {
      method: 'GET',
      headers: authHeaders()
    });

    if (syncMessage) syncMessage.textContent = 'Sincronizando Evolution API...';

    const result = await request('/api/evolution/sync/all', {
      method: 'POST',
      headers: authHeaders()
    });

    if (syncMessage) {
      syncMessage.textContent = `Sincronizados: ${result.importedContacts || 0} contatos e ${result.importedMessages || 0} mensagens.`;
    }

    await Promise.all([loadContacts(), loadMessages()]);
  } catch (error) {
    if (syncMessage) {
      syncMessage.textContent = error.message;
      syncMessage.style.color = '#d94f4f';
    }
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
  await refreshData();
}

async function createFirstAdmin() {
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;

  if (!email || !password) {
    setMessage('Informe e-mail e senha para criar o usuário.', true);
    return;
  }

  const data = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Administrador Formis',
      email,
      password,
      rootPhone: '(11) 94509-2300',
      phone: '(11) 4441-8838'
    })
  });

  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('formis_token', state.token);
  localStorage.setItem('formis_user', JSON.stringify(state.user));
  setAuthenticated(true);
  await refreshData();
}

function logout() {
  state.token = null;
  state.user = null;
  state.attendances = [];
  state.users = [];
  state.contacts = [];
  state.messages = [];
  localStorage.removeItem('formis_token');
  localStorage.removeItem('formis_user');
  renderAttendances();
  renderUsers();
  renderContacts();
  renderMessages();
  setAuthenticated(false);
}

function bindEvents() {
  $('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('Entrando...');

    try {
      await login($('#loginEmail').value.trim(), $('#loginPassword').value);
      setMessage('');
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  $('#seedRegister')?.addEventListener('click', async () => {
    setMessage('Criando usuário...');

    try {
      await createFirstAdmin();
      setMessage('');
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  $('#attendanceForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();

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

      event.target.reset();
      await refreshData();
    } catch (error) {
      alert(error.message);
    }
  });

  $('#userForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#userMessage').textContent = 'Adicionando colaborador...';

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
          extension: $('#newUserExtension')?.value.trim(),
          rootPhone: $('#newUserRootPhone').value.trim() || state.user.rootPhone
        })
      });

      event.target.reset();
      $('#userMessage').textContent = 'Colaborador adicionado.';
      await loadUsers();
    } catch (error) {
      $('#userMessage').textContent = error.message;
    }
  });

  $('#evaluationForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#evaluationMessage').textContent = 'Salvando avaliação...';

    try {
      await request('/api/evaluations', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          attendance: $('#evaluationAttendance').value,
          score: Number($('#evaluationScore').value),
          comment: $('#evaluationComment').value.trim()
        })
      });

      event.target.reset();
      $('#evaluationMessage').textContent = 'Avaliação salva.';
      await loadEvaluations();
    } catch (error) {
      $('#evaluationMessage').textContent = error.message;
    }
  });

  $('#internalChatRecipient')?.addEventListener('change', loadInternalChatMessages);

  $('#internalChatForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#internalChatMessage').textContent = 'Enviando...';

    try {
      await request('/api/internal-chat/messages', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          recipient: $('#internalChatRecipient').value,
          content: $('#internalChatContent').value.trim()
        })
      });

      $('#internalChatContent').value = '';
      $('#internalChatMessage').textContent = 'Mensagem enviada.';
      await loadInternalChatMessages();
    } catch (error) {
      $('#internalChatMessage').textContent = error.message;
    }
  });

  $('#customerChatContact')?.addEventListener('change', renderCustomerChat);

  $('#ticketSearchInput')?.addEventListener('input', (event) => {
    state.ticketSearch = event.target.value;
    renderContacts();
    renderCustomerChat();
  });

  document.querySelectorAll('.ticket-tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.ticketFilter = button.dataset.ticketFilter || 'open';
      state.selectedContactId = null;
      $('#customerChatContact').value = '';
      document.querySelectorAll('.ticket-tab').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderContacts();
      renderCustomerChat();
    });
  });

  $('#returnTicketBtn')?.addEventListener('click', async () => {
    closeFloatingChatPanels();
    await updateSelectedTicket('open');
  });

  $('#pauseTicketBtn')?.addEventListener('click', async () => {
    closeFloatingChatPanels();
    await updateSelectedTicket('paused');
  });

  $('#finishTicketBtn')?.addEventListener('click', async () => {
    closeFloatingChatPanels();
    await updateSelectedTicket('resolved');
  });

  $('#transferTicketBtn')?.addEventListener('click', () => {
    closeFloatingChatPanels();
    const contact = getSelectedContact();
    setTicketActionMessage(contact
      ? `Transferencia de ${contact.name || contact.phone} preparada. Cadastre filas para concluir a transferencia.`
      : 'Selecione um ticket para transferir.');
  });

  $('#deleteTicketBtn')?.addEventListener('click', async () => {
    closeFloatingChatPanels();
    await deleteSelectedTicket();
  });

  $('#deleteTicketMenuBtn')?.addEventListener('click', async () => {
    await deleteSelectedTicket();
    $('#chatMenu')?.classList.add('hidden');
  });

  $('#focusTicketSearchBtn')?.addEventListener('click', () => {
    closeFloatingChatPanels();
    $('#ticketSearchInput')?.focus();
  });

  $('#backToTickets')?.addEventListener('click', () => {
    closeFloatingChatPanels();
    $('#ticketSearchInput')?.focus();
    setCustomerChatMessage('Lista de tickets selecionada.');
  });

  document.querySelector('.chat-icon-btn.info')?.addEventListener('click', () => {
    closeFloatingChatPanels();
    const contact = state.contacts.find((item) => item._id === (state.selectedContactId || $('#customerChatContact')?.value));
    setCustomerChatMessage(contact
      ? `${contact.name || 'Cliente'} - ${contact.phone || 'sem telefone'}`
      : 'Selecione um cliente para ver as informações.');
  });

  document.querySelector('.chat-icon-btn.audio')?.addEventListener('click', () => {
    closeFloatingChatPanels();
    const contact = state.contacts.find((item) => item._id === (state.selectedContactId || $('#customerChatContact')?.value));
    setCustomerChatMessage(contact?.phone ? `Chamada preparada para ${contact.phone}.` : 'Selecione um cliente para iniciar chamada.');
  });

  $('#chatMenuBtn')?.addEventListener('click', () => {
    closeFloatingChatPanels('chatMenu');
    $('#chatMenu')?.classList.toggle('hidden');
  });

  $('#copyPhoneBtn')?.addEventListener('click', async () => {
    const contact = state.contacts.find((item) => item._id === (state.selectedContactId || $('#customerChatContact')?.value));
    if (contact?.phone) {
      await navigator.clipboard?.writeText(contact.phone);
      setCustomerChatMessage('Telefone copiado.');
    }
    $('#chatMenu')?.classList.add('hidden');
  });

  $('#markUnreadBtn')?.addEventListener('click', () => {
    setCustomerChatMessage('Ticket marcado como não lido.');
    $('#chatMenu')?.classList.add('hidden');
  });

  $('#attachBtn')?.addEventListener('click', () => {
    closeFloatingChatPanels('attachPanel');
    $('#attachPanel')?.classList.toggle('hidden');
  });

  $('#voiceBtn')?.addEventListener('click', () => {
    closeFloatingChatPanels();
    setCustomerChatMessage('Gravação de áudio pronta para a próxima etapa de integração.');
  });

  $('#timerBtn')?.addEventListener('click', () => {
    closeFloatingChatPanels();
    setCustomerChatMessage('Agendamento de mensagem pronto para a próxima etapa de integração.');
  });

  $('#emojiToggle')?.addEventListener('click', () => {
    closeFloatingChatPanels('emojiPanel');
    $('#emojiPanel')?.classList.toggle('hidden');
  });

  document.querySelectorAll('#emojiPanel button').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $('#customerChatContent');
      input.value = `${input.value}${button.textContent}`;
      input.focus();
    });
  });

  document.querySelectorAll('#attachPanel button').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $('#attachmentInput');
      if (!input) return;

      const kind = button.dataset.attachKind;
      input.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : '';
      input.click();
      $('#attachPanel')?.classList.add('hidden');
    });
  });

  $('#attachmentInput')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCustomerChatMessage(`Anexo selecionado: ${file.name}`);
  });

  $('#customerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#customerMessage').textContent = 'Adicionando cliente...';

    try {
      await request('/api/contacts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: $('#customerContactName').value.trim(),
          phone: $('#customerContactPhone').value.trim()
        })
      });

      event.target.reset();
      $('#customerMessage').textContent = 'Cliente adicionado.';
      await loadContacts();
    } catch (error) {
      $('#customerMessage').textContent = error.message;
    }
  });

  $('#customerChatForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#customerChatMessage').textContent = 'Enviando mensagem...';

    try {
      await request('/api/messages', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          contact: $('#customerChatContact').value,
          content: $('#customerChatContent').value.trim(),
          channel: 'whatsapp'
        })
      });

      $('#customerChatContent').value = '';
      $('#customerChatMessage').textContent = 'Mensagem enviada.';
      await loadMessages();
    } catch (error) {
      $('#customerChatMessage').textContent = error.message;
    }
  });

  $('#refreshBtn')?.addEventListener('click', refreshData);
  $('#syncEvolutionBtn')?.addEventListener('click', syncEvolution);
  $('#statusFilter')?.addEventListener('change', loadAttendances);
  $('#logoutBtn')?.addEventListener('click', logout);

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      setView(button.dataset.view);
    });
  });
}

ensureLiveDataPanels();
ensureViewStructure();
bindEvents();
setAuthenticated(Boolean(state.token && state.user));
setView(isAdmin() ? 'dashboard' : 'attendances');

if (state.token && state.user) {
  refreshData().catch(() => {
    $('#connectionStatus').textContent = 'API indisponível';
  });
}
