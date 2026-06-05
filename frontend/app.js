const API_URL = localStorage.getItem('adoAgent.apiUrl') || 'http://localhost:8000/chat';
const HEALTH_URL = API_URL.replace(/\/chat\/?$/, '/health');

const layoutEl = document.getElementById('appLayout');
const sidebarEl = document.getElementById('sidebar');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusPill = document.getElementById('statusPill');
const newChatBtn = document.getElementById('newChatBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileSidebarClose = document.getElementById('mobileSidebarClose');
const mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
const themeToggle = document.getElementById('themeToggle');
const outputFormatSelect = document.getElementById('outputFormatSelect');
const clearInputBtn = document.getElementById('clearInputBtn');
const charCounter = document.getElementById('charCounter');
const chatHistoryList = document.getElementById('chatHistoryList');
const activeChatTitle = document.getElementById('activeChatTitle');
const toastRegion = document.getElementById('toastRegion');

const THEME_KEY = 'adoAgent.theme';
const SIDEBAR_COLLAPSED_KEY = 'adoAgent.sidebarCollapsed';
const SIDEBAR_SECTIONS_KEY = 'adoAgent.sidebarSections';
const SESSIONS_KEY = 'adoAgent.sessions.v2';
const LEGACY_SESSIONS_KEY = 'adoAgent.sessions';
const CURRENT_SESSION_KEY = 'adoAgent.currentSessionId';
const MAX_SESSIONS = 12;
const mobileMedia = window.matchMedia('(max-width: 920px)');

let conversationHistory = [];
let displayMessages = [];
let sessions = loadSessions();
let currentSessionId = localStorage.getItem(CURRENT_SESSION_KEY);
let isSending = false;

initApp();

function initApp() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  applySidebarCollapsedState(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  restoreSectionStates();
  setupEventListeners();
  hydrateActiveSession();
  renderMessages();
  renderChatHistory();
  updateInputState();
  handleViewportChange(mobileMedia);
  checkBackendStatus();
  window.setInterval(checkBackendStatus, 45000);
}

function setupEventListeners() {
  inputEl?.addEventListener('input', updateInputState);

  inputEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn?.addEventListener('click', sendMessage);

  clearInputBtn?.addEventListener('click', () => {
    inputEl.value = '';
    updateInputState();
    inputEl.focus();
  });

  document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action="new-chat"]');
    if (actionButton) {
      startNewConversation();
      return;
    }

    const promptButton = event.target.closest('[data-prompt]');
    if (!promptButton) return;

    inputEl.value = promptButton.dataset.prompt || '';

    const format = promptButton.dataset.format;
    if (format && outputFormatSelect) {
      outputFormatSelect.value = format;
    }

    updateInputState();
    inputEl.focus();
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);

    if (mobileMedia.matches) setMobileSidebarOpen(false);
  });

  newChatBtn?.addEventListener('click', startNewConversation);

  clearHistoryBtn?.addEventListener('click', () => {
    const ok = window.confirm('Clear all saved chat history on this browser?');
    if (!ok) return;

    sessions = [];
    currentSessionId = null;
    conversationHistory = [];
    displayMessages = [];
    safeRemoveStorage(SESSIONS_KEY);
    safeRemoveStorage(LEGACY_SESSIONS_KEY);
    safeRemoveStorage(CURRENT_SESSION_KEY);
    renderMessages();
    renderChatHistory();
    updateActiveChatTitle();
    showToast('Chat history cleared.', 'success');
  });

  sidebarToggle?.addEventListener('click', () => {
    const collapsed = !layoutEl.classList.contains('sidebar-collapsed');
    applySidebarCollapsedState(collapsed);
    safeSetStorage(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  });

  mobileMenuBtn?.addEventListener('click', () => setMobileSidebarOpen(true));
  mobileSidebarClose?.addEventListener('click', () => setMobileSidebarOpen(false));
  mobileSidebarOverlay?.addEventListener('click', () => setMobileSidebarOpen(false));

  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    safeSetStorage(THEME_KEY, nextTheme);
  });

  document.querySelectorAll('.sidebar-section[data-collapsible]').forEach((section) => {
    const toggle = section.querySelector('.section-toggle');
    toggle?.addEventListener('click', () => {
      if (layoutEl.classList.contains('sidebar-collapsed') && !mobileMedia.matches) return;
      const nextExpanded = section.classList.contains('collapsed');
      setSectionExpanded(section, nextExpanded);
      saveSectionStates();
    });
  });

  chatHistoryList?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-session-id]');
    if (!item) return;

    currentSessionId = item.dataset.sessionId;
    safeSetStorage(CURRENT_SESSION_KEY, currentSessionId);
    hydrateActiveSession();
    renderMessages();
    renderChatHistory();
    if (mobileMedia.matches) setMobileSidebarOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && layoutEl.classList.contains('mobile-sidebar-open')) {
      setMobileSidebarOpen(false);
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      inputEl.focus();
      inputEl.select();
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      startNewConversation();
    }
  });

  if (mobileMedia.addEventListener) {
    mobileMedia.addEventListener('change', handleViewportChange);
  } else {
    mobileMedia.addListener(handleViewportChange);
  }
}

async function checkBackendStatus() {
  try {
    const response = await fetch(HEALTH_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Backend health check failed');
    setBackendStatus('online', 'Connected');
  } catch {
    setBackendStatus('error', 'Backend offline');
  }
}

function setBackendStatus(status, text) {
  if (statusDot) statusDot.className = `status-dot ${status}`;
  if (statusText) statusText.textContent = text;
  statusPill?.setAttribute('aria-label', text);
}

function updateInputState() {
  if (!inputEl || !sendBtn) return;

  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 150)}px`;

  const length = inputEl.value.length;
  if (charCounter) charCounter.textContent = String(length);

  sendBtn.disabled = isSending || inputEl.value.trim() === '';
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isSending) return;

  ensureSessionForMessage(text);
  removeEmptyState();

  const userMessage = { role: 'user', content: text };
  conversationHistory.push(userMessage);
  displayMessages.push(userMessage);
  appendMessage('user', escapeHtml(text), text);
  persistCurrentSession(text);

  inputEl.value = '';
  updateInputState();
  setSending(true);

  try {
    const selectedFormat = outputFormatSelect?.value || 'chat';
    const detectedFormat = detectOutputFormat(text);
    const outputFormat = selectedFormat !== 'chat' ? selectedFormat : detectedFormat;

    const requestBody = { messages: conversationHistory };
    if (outputFormat && outputFormat !== 'chat') {
      requestBody.output_format = outputFormat;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const contentType = response.headers.get('content-type') || '';
    const contentDisposition = response.headers.get('content-disposition') || '';

    if (isDownloadResponse(contentType, contentDisposition)) {
      const blob = await response.blob();
      const filename = getFilenameFromHeader(contentDisposition) || fallbackFilename(contentType);
      downloadBlob(blob, filename);

      const reply = `✅ File downloaded: ${filename}`;
      const uiMessage = { role: 'assistant', content: reply, uiOnly: true };
      displayMessages.push(uiMessage);
      appendMessage('assistant', formatReply(reply), reply);
      persistCurrentSession();
      resetOutputFormat();
      showToast(`Downloaded ${filename}`, 'success');
      return;
    }

    const data = await response.json();
    const reply = outputFormat === 'json'
      ? `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
      : (data.reply || 'Done.');

    const assistantMessage = { role: 'assistant', content: reply };
    conversationHistory.push(assistantMessage);
    displayMessages.push(assistantMessage);
    appendMessage('assistant', formatReply(reply), reply);
    persistCurrentSession();

    if (outputFormat && outputFormat !== 'chat') resetOutputFormat();
  } catch (error) {
    const message = error?.message || 'Something went wrong.';
    const uiMessage = { role: 'assistant', content: `❌ ${message}`, uiOnly: true };
    displayMessages.push(uiMessage);
    appendMessage('assistant', `<div class="callout error">${escapeHtml(message)}</div>`, message);
    persistCurrentSession();
    showToast(message, 'error');
  } finally {
    setSending(false);
    scrollToBottom();
  }
}

function setSending(value) {
  isSending = value;
  showTyping(value);
  updateInputState();
}

function resetOutputFormat() {
  if (outputFormatSelect) outputFormatSelect.value = 'chat';
}

function detectOutputFormat(text) {
  const lower = text.toLowerCase();
  if (/\b(excel|xlsx)\b/.test(lower)) return 'xlsx';
  if (/\bcsv\b/.test(lower)) return 'csv';
  if (/\b(txt|text file)\b/.test(lower)) return 'txt';
  if (/\bjson\b/.test(lower)) return 'json';
  return null;
}

function isDownloadResponse(contentType, contentDisposition) {
  const disposition = contentDisposition.toLowerCase();
  return disposition.includes('attachment') ||
    contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
    contentType.includes('text/csv') ||
    contentType.includes('text/plain') ||
    contentType.includes('application/octet-stream');
}

async function parseErrorResponse(response) {
  const text = await response.text();
  if (!text) return response.statusText || 'Server error';

  try {
    const parsed = JSON.parse(text);
    return parsed.detail || parsed.error || text;
  } catch {
    return text;
  }
}

function getFilenameFromHeader(contentDisposition) {
  if (!contentDisposition) return null;

  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) return decodeURIComponent(utfMatch[1]);

  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match && match[1] ? match[1] : null;
}

function fallbackFilename(contentType) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (contentType.includes('spreadsheetml')) return `ado_output_${stamp}.xlsx`;
  if (contentType.includes('text/csv')) return `ado_output_${stamp}.csv`;
  if (contentType.includes('text/plain')) return `ado_output_${stamp}.txt`;
  return `ado_output_${stamp}`;
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function appendMessage(role, html, copyText = '') {
  const message = document.createElement('div');
  message.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'You' : 'AI';

  const shell = document.createElement('div');
  shell.className = 'message-shell';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = html;

  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'message-action-btn';
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', () => copyToClipboard(copyText || bubble.innerText));

  actions.appendChild(copyButton);
  shell.appendChild(bubble);
  shell.appendChild(actions);
  message.appendChild(avatar);
  message.appendChild(shell);
  messagesEl.appendChild(message);
  scrollToBottom();
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
    showToast('Copied to clipboard.', 'success');
  } catch {
    try {
      fallbackCopy(text);
      showToast('Copied to clipboard.', 'success');
    } catch {
      showToast('Copy failed. Select and copy manually.', 'error');
    }
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function showTyping(visible) {
  typingIndicator?.classList.toggle('hidden', !visible);
  if (visible) scrollToBottom();
}

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatReply(input = '') {
  let text = escapeMarkdown(input).replace(/&amp;nbsp;/g, ' ');

  const codeBlocks = [];
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, language, code) => {
    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    const label = language ? `<div class="code-label">${escapeMarkdown(language)}</div>` : '';
    codeBlocks.push(`<pre>${label}<code>${code.trim()}</code></pre>`);
    return token;
  });

  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@INLINE_CODE_${inlineCodes.length}@@`;
    inlineCodes.push(`<code>${code}</code>`);
    return token;
  });

  const tables = [];
  text = extractMarkdownTables(text, tables);

  text = text
    .replace(/^\s*---\s*$/gm, '<hr>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^✅\s*(.+)$/gm, '<div class="callout success">✅ $1</div>')
    .replace(/^\[OK\]\s*(.+)$/gm, '<div class="callout success">✅ $1</div>')
    .replace(/^❌\s*(.+)$/gm, '<div class="callout error">❌ $1</div>')
    .replace(/^\[ERROR\]\s*(.+)$/gm, '<div class="callout error">❌ $1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[^="])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

  text = text.replace(/(?:^- .+(?:\n|$))+/gm, (block) => {
    const items = block.trim().split('\n')
      .map((line) => line.replace(/^- (.+)$/, '<li>$1</li>'))
      .join('');
    return `<ul>${items}</ul>`;
  });

  text = text.replace(/(?:^\d+\. .+(?:\n|$))+/gm, (block) => {
    const items = block.trim().split('\n')
      .map((line) => line.replace(/^\d+\. (.+)$/, '<li>$1</li>'))
      .join('');
    return `<ol>${items}</ol>`;
  });

  text = text.replace(/\n/g, '<br>');

  tables.forEach((html, index) => {
    text = text.replace(`@@TABLE_${index}@@`, html);
  });

  inlineCodes.forEach((html, index) => {
    text = text.replace(`@@INLINE_CODE_${index}@@`, html);
  });

  codeBlocks.forEach((html, index) => {
    text = text.replace(`@@CODE_BLOCK_${index}@@`, html);
  });

  return text;
}

function extractMarkdownTables(text, tables) {
  const lines = text.split('\n');
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1];

    if (isMarkdownTableHeader(line, next)) {
      const tableLines = [line];
      index += 2;

      while (index < lines.length && isTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }

      const token = `@@TABLE_${tables.length}@@`;
      tables.push(buildTableHtml(tableLines));
      output.push(token);
      continue;
    }

    output.push(line);
    index += 1;
  }

  return output.join('\n');
}

function isMarkdownTableHeader(line, separator) {
  return isTableRow(line) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator || '');
}

function isTableRow(line) {
  return /^\s*\|.+\|\s*$/.test(line || '');
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function buildTableHtml(lines) {
  const headers = splitTableRow(lines[0]);
  const rows = lines.slice(1).map(splitTableRow);
  const safeCell = (value) => escapeMarkdown(value);

  const head = headers.map((cell) => `<th>${safeCell(cell)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${safeCell(cell)}</td>`).join('')}</tr>`)
    .join('');

  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function showToast(message, type = 'success') {
  if (!toastRegion) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = normalized;
  themeToggle?.setAttribute('title', normalized === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  themeToggle?.setAttribute('aria-label', normalized === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
}

function applySidebarCollapsedState(collapsed) {
  if (mobileMedia.matches) collapsed = false;
  layoutEl?.classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle?.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  sidebarToggle?.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
}

function setMobileSidebarOpen(open) {
  layoutEl?.classList.toggle('mobile-sidebar-open', open);
  document.body.classList.toggle('no-scroll', mobileMedia.matches && open);
  mobileMenuBtn?.setAttribute('aria-expanded', String(open));
  sidebarEl?.setAttribute('aria-hidden', String(mobileMedia.matches && !open));
}

function handleViewportChange(event) {
  const isMobile = event.matches;

  if (isMobile) {
    layoutEl?.classList.remove('sidebar-collapsed');
    setMobileSidebarOpen(false);
    sidebarEl?.setAttribute('aria-hidden', 'true');
  } else {
    setMobileSidebarOpen(false);
    sidebarEl?.removeAttribute('aria-hidden');
    applySidebarCollapsedState(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  }
}

function setSectionExpanded(section, expanded) {
  section.classList.toggle('collapsed', !expanded);
  const toggle = section.querySelector('.section-toggle');
  toggle?.setAttribute('aria-expanded', String(expanded));
}

function restoreSectionStates() {
  const states = loadJson(SIDEBAR_SECTIONS_KEY, {});
  document.querySelectorAll('.sidebar-section[data-collapsible]').forEach((section) => {
    const id = section.dataset.sectionId;
    setSectionExpanded(section, states[id] !== false);
  });
}

function saveSectionStates() {
  const states = {};
  document.querySelectorAll('.sidebar-section[data-collapsible]').forEach((section) => {
    states[section.dataset.sectionId] = !section.classList.contains('collapsed');
  });
  safeSetStorage(SIDEBAR_SECTIONS_KEY, JSON.stringify(states));
}

function startNewConversation() {
  currentSessionId = null;
  conversationHistory = [];
  displayMessages = [];
  safeRemoveStorage(CURRENT_SESSION_KEY);
  renderMessages();
  renderChatHistory();
  updateActiveChatTitle();
  inputEl?.focus();
  if (mobileMedia.matches) setMobileSidebarOpen(false);
}

function hydrateActiveSession() {
  const session = getCurrentSession();

  if (!session) {
    conversationHistory = [];
    displayMessages = [];
    currentSessionId = null;
    safeRemoveStorage(CURRENT_SESSION_KEY);
    updateActiveChatTitle();
    return;
  }

  conversationHistory = Array.isArray(session.backendMessages)
    ? session.backendMessages.slice()
    : (Array.isArray(session.messages) ? session.messages.filter((message) => !message.uiOnly).slice() : []);

  displayMessages = Array.isArray(session.messages)
    ? session.messages.slice()
    : conversationHistory.slice();

  updateActiveChatTitle();
}

function ensureSessionForMessage(titleCandidate = '') {
  if (currentSessionId && getCurrentSession()) return;

  const session = {
    id: createId(),
    title: makeTitle(titleCandidate) || 'Untitled Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    backendMessages: [],
  };

  sessions.unshift(session);
  sessions = sessions.slice(0, MAX_SESSIONS);
  currentSessionId = session.id;
  safeSetStorage(CURRENT_SESSION_KEY, currentSessionId);
  saveSessions();
  updateActiveChatTitle();
}

function getCurrentSession() {
  return sessions.find((session) => session.id === currentSessionId) || null;
}

function persistCurrentSession(titleCandidate = '') {
  const session = getCurrentSession();
  if (!session) return;

  session.messages = displayMessages.slice();
  session.backendMessages = conversationHistory.slice();
  session.updatedAt = Date.now();

  if ((!session.title || session.title === 'Untitled Chat' || session.title === 'New conversation') && titleCandidate) {
    session.title = makeTitle(titleCandidate);
  }

  sessions = [session, ...sessions.filter((item) => item.id !== session.id)].slice(0, MAX_SESSIONS);
  saveSessions();
  renderChatHistory();
  updateActiveChatTitle();
}

function renderMessages() {
  if (!messagesEl) return;

  messagesEl.innerHTML = '';

  if (!displayMessages.length) {
    renderEmptyState();
    return;
  }

  displayMessages.forEach((message) => {
    if (message.role === 'user') {
      appendMessage('user', escapeHtml(message.content), message.content);
    } else {
      appendMessage('assistant', formatReply(message.content), message.content);
    }
  });
}

function renderEmptyState() {
  messagesEl.innerHTML = `
    <div class="empty-state" id="emptyState">
      <span class="empty-icon" aria-hidden="true">◆</span>
      <h1>Ask ADO Agent</h1>
      <p>Create, update, inspect, link, and export Azure DevOps work items.</p>
      <div class="empty-actions">
        <button type="button" data-prompt="Get complete hierarchy for epic #">Hierarchy</button>
        <button type="button" data-format="xlsx" data-prompt="Give task report in Excel under work item #">Excel report</button>
        <button type="button" data-prompt="Create a task under story #">Create task</button>
      </div>
    </div>
  `;
}

function removeEmptyState() {
  document.getElementById('emptyState')?.remove();
}

function renderChatHistory() {
  if (!chatHistoryList) return;

  if (!sessions.length) {
    chatHistoryList.innerHTML = '<button class="history-empty" type="button" disabled>No saved chats yet</button>';
    return;
  }

  chatHistoryList.innerHTML = sessions.map((session) => {
    const active = session.id === currentSessionId ? ' active' : '';
    const count = session.messages?.length || session.backendMessages?.length || 0;
    return `
      <button class="history-item${active}" type="button" data-session-id="${escapeMarkdown(session.id)}">
        <span class="history-title">${escapeMarkdown(session.title || 'Untitled Chat')}</span>
        <span class="history-meta">${count} messages · ${formatRelativeTime(session.updatedAt)}</span>
      </button>
    `;
  }).join('');
}

function updateActiveChatTitle() {
  const session = getCurrentSession();
  if (activeChatTitle) activeChatTitle.textContent = session?.title || 'New conversation';
}

function makeTitle(text) {
  const cleaned = String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? cleaned.slice(0, 46) : 'Untitled Chat';
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'now';

  const diff = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

function createId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadSessions() {
  const loaded = loadJson(SESSIONS_KEY, null) || loadJson(LEGACY_SESSIONS_KEY, []);
  if (!Array.isArray(loaded)) return [];

  return loaded.slice(0, MAX_SESSIONS).map((session) => ({
    id: session.id || createId(),
    title: session.title || 'Untitled Chat',
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
    messages: Array.isArray(session.messages) ? session.messages : [],
    backendMessages: Array.isArray(session.backendMessages)
      ? session.backendMessages
      : (Array.isArray(session.messages) ? session.messages.filter((message) => !message.uiOnly) : []),
  }));
}

function saveSessions() {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    try {
      sessions = sessions.slice(0, 5);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      showToast('Old chats were trimmed to save space.', 'error');
    } catch {
      showToast('Could not save chat history in this browser.', 'error');
    }
  }
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSetStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore non-critical storage failures
  }
}

function safeRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}
