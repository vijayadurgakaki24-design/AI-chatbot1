// Client-side Application State
let conversations = [];
let activeConversationId = null;
let isGenerating = false;
let searchTimeout = null;
let activeChatMessages = {};
let activeAbortController = null;

// User Settings Configuration (Stored in LocalStorage)
let userSettings = {
    theme: localStorage.getItem('settings_theme') || 'dark',
    fontSize: localStorage.getItem('settings_font') || 'medium',
    typingAnimation: localStorage.getItem('settings_typing') !== 'false',
    markdownEnabled: localStorage.getItem('settings_markdown') !== 'false',
    aiModel: localStorage.getItem('settings_model') || 'llama-3.3-70b-versatile'
};

// DOM Elements cache
const elements = {
    btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
    sidebarDrawer: document.getElementById('sidebar-drawer'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    
    btnNewChat: document.getElementById('btn-new-chat'),
    searchInput: document.getElementById('search-input'),
    conversationsList: document.getElementById('conversations-list'),
    
    mainContainer: document.getElementById('main-container'),
    activeChatBanner: document.getElementById('active-chat-banner'),
    activeChatTitle: document.getElementById('active-chat-title'),
    btnRenameActive: document.getElementById('btn-rename-active'),
    btnExportChat: document.getElementById('btn-export-chat'),
    btnDeleteActive: document.getElementById('btn-delete-active'),
    
    welcomeScreen: document.getElementById('welcome-screen'),
    statConvs: document.getElementById('stat-convs'),
    statMsgs: document.getElementById('stat-msgs'),
    statToday: document.getElementById('stat-today'),
    
    messagesContainer: document.getElementById('messages-container'),
    messagesList: document.getElementById('messages-list'),
    typingIndicator: document.getElementById('typing-indicator'),
    
    chatInput: document.getElementById('chat-input'),
    btnSend: document.getElementById('btn-send'),
    charCounter: document.getElementById('char-counter'),
    
    deleteModal: document.getElementById('delete-modal'),
    btnConfirmDeleteModal: document.getElementById('btn-confirm-delete-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),
    btnCancelModalX: document.getElementById('btn-cancel-modal-x'),
    
    btnSettingsToggle: document.getElementById('btn-settings-toggle'),
    settingsModal: document.getElementById('settings-modal'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    settingsThemeSelect: document.getElementById('settings-theme-select'),
    settingsFontSelect: document.getElementById('settings-font-select'),
    settingsTypingToggle: document.getElementById('settings-typing-toggle'),
    settingsMarkdownToggle: document.getElementById('settings-markdown-toggle'),
    settingsModelSelect: document.getElementById('settings-model-select'),
    settingsApiStatus: document.getElementById('settings-api-status'),
    btnSettingsExportAll: document.getElementById('btn-settings-export-all'),
    btnSettingsClearAll: document.getElementById('btn-settings-clear-all'),
    
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    themeToggleText: document.getElementById('theme-toggle-text'),
    
    toastContainer: document.getElementById('toast-container')
};

// Defensive CDN Helpers (Prevents crash if offline/CDNs blocked)
function safeCreateIcons() {
    if (typeof lucide !== 'undefined') {
        try {
            lucide.createIcons();
        } catch (e) {
            console.error('Error calling lucide.createIcons:', e);
        }
    }
}

function safeHighlightUnder(element) {
    if (typeof Prism !== 'undefined') {
        try {
            Prism.highlightAllUnder(element);
        } catch (e) {
            console.error('Error calling Prism.highlightAllUnder:', e);
        }
    }
}

function safeParseMarkdown(text) {
    if (userSettings.markdownEnabled && typeof marked !== 'undefined') {
        try {
            return marked.parse(text);
        } catch (e) {
            console.error('Error calling marked.parse:', e);
        }
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// Configure Marked custom renderer if library loaded
if (typeof marked !== 'undefined') {
    try {
        marked.use({
            renderer: {
                code(codeObj) {
                    const text = codeObj.text;
                    const lang = codeObj.lang || 'plaintext';
                    const escapedText = escapeHtml(text);
                    const randomId = 'code-' + Math.random().toString(36).substring(2, 9);
                    
                    return `
                        <div class="code-container">
                            <div class="code-header">
                                <span>${lang.toUpperCase()}</span>
                                <button class="btn-copy-code" data-code-id="${randomId}">
                                    Copy
                                </button>
                            </div>
                            <pre><code class="language-${lang}" id="${randomId}">${escapedText}</code></pre>
                        </div>
                    `;
                }
            }
        });

        marked.setOptions({
            breaks: true,
            gfm: true
        });
    } catch (e) {
        console.error('Error configuring marked:', e);
    }
}

// Initialization and State Appliers
document.addEventListener('DOMContentLoaded', () => {
    applySettings();
    loadStats();
    loadConversations();
    setupEventListeners();
    loadApiStatus();
    
    if (elements.chatInput) {
        elements.chatInput.disabled = false;
        elements.chatInput.focus();
    }
    
    safeCreateIcons();
});

function applySettings() {
    document.documentElement.setAttribute('data-theme', userSettings.theme);
    if (elements.settingsThemeSelect) {
        elements.settingsThemeSelect.value = userSettings.theme;
    }
    updateThemeUI(userSettings.theme);
    
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${userSettings.fontSize}`);
    if (elements.settingsFontSelect) {
        elements.settingsFontSelect.value = userSettings.fontSize;
    }
    
    if (elements.settingsTypingToggle) {
        elements.settingsTypingToggle.checked = userSettings.typingAnimation;
    }
    
    if (elements.settingsMarkdownToggle) {
        elements.settingsMarkdownToggle.checked = userSettings.markdownEnabled;
    }
    
    if (elements.settingsModelSelect) {
        elements.settingsModelSelect.value = userSettings.aiModel;
    }
}

function updateThemeUI(theme) {
    if (elements.themeIcon && elements.themeToggleText) {
        if (theme === 'light') {
            elements.themeIcon.setAttribute('data-lucide', 'moon');
            elements.themeToggleText.textContent = 'Dark Mode';
        } else {
            elements.themeIcon.setAttribute('data-lucide', 'sun');
            elements.themeToggleText.textContent = 'Light Mode';
        }
        safeCreateIcons();
    }
}

async function loadApiStatus() {
    if (!elements.settingsApiStatus) return;
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (res.ok) {
            if (data.groq === 'online') {
                elements.settingsApiStatus.textContent = 'Online';
                elements.settingsApiStatus.className = 'status-val status-online';
            } else {
                elements.settingsApiStatus.textContent = 'Simulation';
                elements.settingsApiStatus.className = 'status-val status-offline';
            }
        }
    } catch (e) {
        elements.settingsApiStatus.textContent = 'Disconnected';
        elements.settingsApiStatus.className = 'status-val status-offline';
    }
}

// Conversation list CRUD operations
async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (res.ok) {
            if (elements.statConvs) elements.statConvs.textContent = data.total_conversations;
            if (elements.statMsgs) elements.statMsgs.textContent = data.total_messages;
            if (elements.statToday) elements.statToday.textContent = data.today_messages;
        }
    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

async function loadConversations(searchQuery = '') {
    try {
        const url = searchQuery ? `/api/conversations?q=${encodeURIComponent(searchQuery)}` : '/api/conversations';
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok) {
            conversations = data;
            renderConversationsList();
        }
    } catch (e) {
        console.error('Error loading conversations:', e);
        showToast('Failed to load chats');
    }
}

function renderConversationsList() {
    if (!elements.conversationsList) return;
    elements.conversationsList.innerHTML = '';
    
    if (conversations.length === 0) {
        elements.conversationsList.innerHTML = '<div style="padding: 16px; font-size: 0.82rem; text-align: center; color: var(--text-muted);">No chats found</div>';
        return;
    }
    
    conversations.forEach(conv => {
        const isActive = conv.id === activeConversationId;
        const item = document.createElement('div');
        item.className = `conv-item ${isActive ? 'active' : ''}`;
        item.dataset.id = conv.id;
        
        item.innerHTML = `
            <div class="conv-left">
                <i data-lucide="message-square" style="width:14px;height:14px;flex-shrink:0;"></i>
                <span class="conv-title">${escapeHtml(conv.title)}</span>
            </div>
            <div class="conv-actions">
                <button class="conv-action-btn rename-btn" title="Rename Title">
                    <i data-lucide="edit-2" style="width:12px;height:12px;"></i>
                </button>
                <button class="conv-action-btn delete-btn" title="Delete Chat">
                    <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                </button>
            </div>
        `;
        
        item.addEventListener('click', (e) => {
            if (e.target.closest('.conv-action-btn')) return;
            selectConversation(conv.id);
            closeSidebar();
        });
        
        const btnRename = item.querySelector('.rename-btn');
        btnRename.addEventListener('click', (e) => {
            e.stopPropagation();
            renameConversationPrompt(conv.id, conv.title);
        });
        
        const btnDelete = item.querySelector('.delete-btn');
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteModal(conv.id);
        });
        
        elements.conversationsList.appendChild(item);
    });
    
    safeCreateIcons();
}

async function selectConversation(id) {
    if (isGenerating) return;
    
    activeConversationId = id;
    renderConversationsList();
    
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    
    if (elements.mainContainer) elements.mainContainer.classList.remove('welcome-state');
    if (elements.welcomeScreen) elements.welcomeScreen.style.display = 'none';
    if (elements.messagesContainer) elements.messagesContainer.style.display = 'flex';
    if (elements.activeChatBanner) elements.activeChatBanner.style.display = 'flex';
    if (elements.chatInput) elements.chatInput.disabled = false;
    
    if (elements.btnSend) {
        elements.btnSend.disabled = !elements.chatInput || elements.chatInput.value.trim().length === 0;
    }
    
    if (elements.activeChatTitle) elements.activeChatTitle.textContent = conv.title;
    if (elements.messagesList) elements.messagesList.innerHTML = '';
    
    try {
        const res = await fetch(`/api/conversations/${id}/messages`);
        const messages = await res.json();
        if (res.ok) {
            messages.forEach(msg => appendMessageBubble(msg));
            scrollToBottom();
        }
    } catch (e) {
        console.error('Error fetching messages:', e);
        showToast('Failed to load chat history');
    }
    
    if (elements.chatInput) elements.chatInput.focus();
}

async function createNewConversation() {
    if (isGenerating) return;
    
    try {
        const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat' })
        });
        const data = await res.json();
        if (res.ok) {
            await loadConversations();
            selectConversation(data.id);
            showToast('New conversation created');
            closeSidebar();
        }
    } catch (e) {
        console.error('Error creating chat:', e);
        showToast('Failed to create new chat');
    }
}

async function renameConversationPrompt(id, currentTitle) {
    const newTitle = prompt('Rename conversation:', currentTitle);
    if (newTitle === null || !newTitle.trim()) return;
    
    await renameConversation(id, newTitle.trim());
}

async function renameConversation(id, newTitle) {
    try {
        const res = await fetch(`/api/conversations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        if (res.ok) {
            await loadConversations();
            if (activeConversationId === id && elements.activeChatTitle) {
                elements.activeChatTitle.textContent = newTitle;
            }
            showToast('Conversation renamed');
        }
    } catch (e) {
        console.error('Error renaming conversation:', e);
        showToast('Failed to rename conversation');
    }
}

// Delete Confirmation Modal Control
let idToDelete = null;

function openDeleteModal(id) {
    idToDelete = id;
    if (elements.deleteModal) elements.deleteModal.classList.add('open');
}

function closeDeleteModal() {
    idToDelete = null;
    if (elements.deleteModal) elements.deleteModal.classList.remove('open');
}

async function confirmDeleteChat() {
    if (!idToDelete) return;
    
    try {
        const res = await fetch(`/api/conversations/${idToDelete}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            if (activeConversationId === idToDelete) {
                activeConversationId = null;
                showWelcomeScreen();
            }
            closeDeleteModal();
            closeSidebar();
            await loadConversations();
            await loadStats();
            showToast('Conversation deleted');
        }
    } catch (e) {
        console.error('Error deleting conversation:', e);
        showToast('Failed to delete conversation');
    }
}

async function clearAllConversations() {
    if (!confirm('Are you sure you want to delete ALL conversations? This cannot be undone.')) {
        return;
    }
    
    try {
        const res = await fetch('/api/conversations', {
            method: 'DELETE'
        });
        if (res.ok) {
            activeConversationId = null;
            showWelcomeScreen();
            closeSettingsModal();
            closeSidebar();
            await loadConversations();
            await loadStats();
            showToast('All conversations cleared!');
        }
    } catch (e) {
        console.error('Error clearing chats:', e);
        showToast('Failed to clear conversations');
    }
}

function showWelcomeScreen() {
    if (elements.mainContainer) elements.mainContainer.classList.add('welcome-state');
    if (elements.welcomeScreen) elements.welcomeScreen.style.display = 'flex';
    if (elements.messagesContainer) elements.messagesContainer.style.display = 'none';
    if (elements.activeChatBanner) elements.activeChatBanner.style.display = 'none';
    if (elements.chatInput) {
        elements.chatInput.disabled = false;
        elements.chatInput.value = '';
        elements.chatInput.style.height = 'auto';
    }
    if (elements.btnSend) elements.btnSend.disabled = true;
    if (elements.charCounter) elements.charCounter.textContent = '0 / 5000';
    
    loadStats();
}

// Settings Modal dialog toggles
function openSettingsModal() {
    loadApiStatus();
    if (elements.settingsModal) elements.settingsModal.classList.add('open');
}

function closeSettingsModal() {
    if (elements.settingsModal) elements.settingsModal.classList.remove('open');
}

// Sidebar toggle helpers
function closeSidebar() {
    if (elements.sidebarDrawer) elements.sidebarDrawer.classList.remove('open');
    if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('show');
}

// Chat Messaging & SSE stream handlers
async function sendMessage() {
    if (!elements.chatInput) return;
    const text = elements.chatInput.value.trim();
    if (!text || isGenerating) return;
    
    isGenerating = true;
    toggleInputState(true);
    elements.chatInput.value = '';
    if (elements.charCounter) elements.charCounter.textContent = '0 / 5000';
    elements.chatInput.style.height = 'auto';
    
    // Toggle send button visibility to Stop Generating
    if (elements.btnSend) elements.btnSend.style.display = 'none';
    const btnStopGen = document.getElementById('btn-stop-generating');
    if (btnStopGen) btnStopGen.style.display = 'inline-flex';
    
    // Setup AbortController
    activeAbortController = new AbortController();
    
    // Auto-create chat session on the fly if user is on the welcome page
    if (!activeConversationId) {
        try {
            const res = await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'New Chat' })
            });
            const data = await res.json();
            if (res.ok) {
                activeConversationId = data.id;
                if (elements.mainContainer) elements.mainContainer.classList.remove('welcome-state');
                if (elements.welcomeScreen) elements.welcomeScreen.style.display = 'none';
                if (elements.messagesContainer) elements.messagesContainer.style.display = 'flex';
                if (elements.activeChatBanner) elements.activeChatBanner.style.display = 'flex';
                if (elements.activeChatTitle) elements.activeChatTitle.textContent = data.title;
                if (elements.messagesList) elements.messagesList.innerHTML = '';
            } else {
                throw new Error('Could not create automatic conversation');
            }
        } catch (e) {
            console.error('Automatic chat creation failed:', e);
            showToast('Failed to create session');
            isGenerating = false;
            if (btnStopGen) btnStopGen.style.display = 'none';
            if (elements.btnSend) elements.btnSend.style.display = 'inline-flex';
            toggleInputState(false);
            return;
        }
    }
    
    // Snapshot the attachments queue
    const activeAttachments = [...fileUploadQueue];
    
    const userMsgObj = { id: 'temp-user', role: 'user', content: text, attachments: activeAttachments };
    appendMessageBubble(userMsgObj);
    scrollToBottom();
    
    if (elements.typingIndicator) elements.typingIndicator.style.display = 'block';
    scrollToBottom();
    
    const aiBubbleId = 'ai-temp-' + Math.random().toString(36).substring(2, 9);
    const aiMsgObj = { id: aiBubbleId, role: 'assistant', content: '' };
    appendMessageBubble(aiMsgObj);
    const aiBubbleBody = document.getElementById(`body-${aiBubbleId}`);
    const aiBubbleActions = document.getElementById(`actions-${aiBubbleId}`);
    
    try {
        const res = await fetch(`/api/conversations/${activeConversationId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: text, 
                model: userSettings.aiModel,
                attachments: activeAttachments
            }),
            signal: activeAbortController.signal
        });
        
        if (!res.ok) throw new Error('Failed to start chat streaming');
        
        if (elements.typingIndicator) elements.typingIndicator.style.display = 'none';
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponseText = '';
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith('data: ')) {
                    const chunkText = cleanLine.substring(6);
                    
                    if (chunkText === '[DONE]') {
                        break;
                    } else if (chunkText.startsWith('[STATS]')) {
                        const elapsed = chunkText.substring(7);
                        if (aiBubbleActions) {
                            const timerSpan = aiBubbleActions.querySelector('.response-timer-meta');
                            if (timerSpan) {
                                timerSpan.innerHTML = `Generated in ${elapsed}s`;
                            }
                        }
                    } else if (chunkText.startsWith('[ERROR]')) {
                        const errorMsg = chunkText.substring(7);
                        if (aiBubbleBody) {
                            aiBubbleBody.innerHTML = `<span style="color: #ef4444;">Error: ${errorMsg}</span>`;
                        }
                    } else {
                        fullResponseText += chunkText;
                        if (aiBubbleBody) {
                            aiBubbleBody.innerHTML = safeParseMarkdown(fullResponseText);
                            safeHighlightUnder(aiBubbleBody);
                        }
                        scrollToBottom();
                    }
                }
            }
        }
        
        const activeConv = conversations.find(c => c.id === activeConversationId);
        const wasNewChat = activeConv && activeConv.title === 'New Chat';
        
        await loadConversations();
        await loadStats();
        
        if (wasNewChat) {
            const updatedConv = conversations.find(c => c.id === activeConversationId);
            if (updatedConv && elements.activeChatTitle) {
                elements.activeChatTitle.textContent = updatedConv.title;
            }
        }
        
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log("Generation aborted by user.");
        } else {
            console.error('Error during chat stream:', e);
            if (elements.typingIndicator) elements.typingIndicator.style.display = 'none';
            if (aiBubbleBody) {
                aiBubbleBody.innerHTML = `<span style="color: #ef4444;">Could not connect to AI service. Ensure your server is running and GROQ_API_KEY is configured.</span>`;
            }
            showToast('Connection error');
        }
    } finally {
        isGenerating = false;
        activeAbortController = null;
        if (btnStopGen) btnStopGen.style.display = 'none';
        if (elements.btnSend) elements.btnSend.style.display = 'inline-flex';
        fileUploadQueue = [];
        renderAttachmentPreviews();
        toggleInputState(false);
        selectConversation(activeConversationId);
    }
}

async function regenerateLastResponse() {
    if (isGenerating || !activeConversationId) return;
    
    isGenerating = true;
    toggleInputState(true);
    
    if (!elements.messagesList) return;
    const messages = elements.messagesList.querySelectorAll('.message-bubble');
    if (messages.length === 0) {
        isGenerating = false;
        toggleInputState(false);
        return;
    }
    
    if (elements.typingIndicator) elements.typingIndicator.style.display = 'block';
    scrollToBottom();
    
    const aiBubbleId = 'ai-temp-' + Math.random().toString(36).substring(2, 9);
    const aiMsgObj = { id: aiBubbleId, role: 'assistant', content: '' };
    appendMessageBubble(aiMsgObj);
    const aiBubbleBody = document.getElementById(`body-${aiBubbleId}`);
    const aiBubbleActions = document.getElementById(`actions-${aiBubbleId}`);
    
    try {
        const res = await fetch(`/api/conversations/${activeConversationId}/regenerate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: userSettings.aiModel })
        });
        
        if (!res.ok) throw new Error('Failed to start response regeneration');
        
        if (elements.typingIndicator) elements.typingIndicator.style.display = 'none';
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponseText = '';
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith('data: ')) {
                    const chunkText = cleanLine.substring(6);
                    
                    if (chunkText === '[DONE]') {
                        break;
                    } else if (chunkText.startsWith('[STATS]')) {
                        const elapsed = chunkText.substring(7);
                        if (aiBubbleActions) {
                            const timerSpan = aiBubbleActions.querySelector('.response-timer-meta');
                            if (timerSpan) {
                                timerSpan.innerHTML = `Generated in ${elapsed}s`;
                            }
                        }
                    } else if (chunkText.startsWith('[ERROR]')) {
                        const errorMsg = chunkText.substring(7);
                        if (aiBubbleBody) {
                            aiBubbleBody.innerHTML = `<span style="color: #ef4444;">Error: ${errorMsg}</span>`;
                        }
                    } else {
                        fullResponseText += chunkText;
                        if (aiBubbleBody) {
                            aiBubbleBody.innerHTML = safeParseMarkdown(fullResponseText);
                            safeHighlightUnder(aiBubbleBody);
                        }
                        scrollToBottom();
                    }
                }
            }
        }
        
    } catch (e) {
        console.error('Error during regeneration stream:', e);
        if (elements.typingIndicator) elements.typingIndicator.style.display = 'none';
        if (aiBubbleBody) {
            aiBubbleBody.innerHTML = `<span style="color: #ef4444;">Could not connect to AI service for regeneration.</span>`;
        }
        showToast('Regeneration error');
    } finally {
        isGenerating = false;
        toggleInputState(false);
        selectConversation(activeConversationId);
    }
}

// Speech Synthesis active states
let currentUtterance = null;
let currentSpeechId = null;

function stopActiveSpeech() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        if (currentSpeechId) {
            const playBtn = document.querySelector(`.speak-play-btn[data-id="${currentSpeechId}"]`);
            const pauseBtn = document.querySelector(`.speak-pause-btn[data-id="${currentSpeechId}"]`);
            const stopBtn = document.querySelector(`.speak-stop-btn[data-id="${currentSpeechId}"]`);
            if (playBtn) playBtn.style.display = 'inline-flex';
            if (pauseBtn) pauseBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'none';
        }
        currentUtterance = null;
        currentSpeechId = null;
    }
}

function speakMessage(msgId) {
    const body = document.getElementById(`body-${msgId}`);
    if (!body || !window.speechSynthesis) return;
    
    stopActiveSpeech();
    
    const text = body.innerText || body.textContent;
    currentSpeechId = msgId;
    currentUtterance = new SpeechSynthesisUtterance(text);
    
    const playBtn = document.querySelector(`.speak-play-btn[data-id="${msgId}"]`);
    const pauseBtn = document.querySelector(`.speak-pause-btn[data-id="${msgId}"]`);
    const stopBtn = document.querySelector(`.speak-stop-btn[data-id="${msgId}"]`);
    
    currentUtterance.onend = () => {
        if (playBtn) playBtn.style.display = 'inline-flex';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        currentUtterance = null;
        currentSpeechId = null;
    };
    
    currentUtterance.onerror = () => {
        if (playBtn) playBtn.style.display = 'inline-flex';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        currentUtterance = null;
        currentSpeechId = null;
    };
    
    if (playBtn) playBtn.style.display = 'none';
    if (pauseBtn) {
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.innerHTML = '<i data-lucide="pause" style="width:12px;height:12px;"></i> Pause';
    }
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    
    safeCreateIcons();
    window.speechSynthesis.speak(currentUtterance);
}

function pauseSpeech(msgId) {
    if (!window.speechSynthesis) return;
    const pauseBtn = document.querySelector(`.speak-pause-btn[data-id="${msgId}"]`);
    
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        if (pauseBtn) {
            pauseBtn.innerHTML = '<i data-lucide="play" style="width:12px;height:12px;"></i> Resume';
            safeCreateIcons();
        }
    } else if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        if (pauseBtn) {
            pauseBtn.innerHTML = '<i data-lucide="pause" style="width:12px;height:12px;"></i> Pause';
            safeCreateIcons();
        }
    }
}

// Bubble rendering and UI handlers
function appendMessageBubble(msg) {
    if (!elements.messagesList) return;
    
    // Cache the message raw text content for client-side download formatting
    activeChatMessages[msg.id] = msg.content;
    
    const isUser = msg.role === 'user';
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.role}`;
    bubble.id = `msg-${msg.id}`;
    
    const avatarLabel = isUser ? 'User' : 'AI';
    const formattedContent = isUser ? escapeHtml(msg.content) : safeParseMarkdown(msg.content);
    
    let actionToolbarHtml = '';
    if (!isUser) {
        const timerText = msg.response_time ? `Generated in ${msg.response_time}s` : '';
        
        actionToolbarHtml = `
            <div class="message-actions-toolbar" id="actions-${msg.id}">
                <span class="response-timer-meta">
                    ${timerText}
                </span>
                <div class="action-btn-group">
                    <button class="msg-action-btn speak-play-btn" data-id="${msg.id}" title="Read Aloud">
                        <i data-lucide="volume-2" style="width:13px;height:13px;"></i>
                    </button>
                    <button class="msg-action-btn speak-pause-btn" data-id="${msg.id}" title="Pause Speech" style="display:none;">
                        <i data-lucide="pause" style="width:13px;height:13px;"></i>
                    </button>
                    <button class="msg-action-btn speak-stop-btn" data-id="${msg.id}" title="Stop Speech" style="display:none;">
                        <i data-lucide="square" style="width:13px;height:13px;"></i>
                    </button>
                    <button class="msg-action-btn copy-btn" data-id="${msg.id}" title="Copy Response">
                        <i data-lucide="copy" style="width:13px;height:13px;"></i>
                    </button>
                    
                    <!-- Download Dropdown Menu -->
                    <div class="action-dropdown-container">
                        <button class="msg-action-btn download-trigger-btn" data-id="${msg.id}" title="Download Response">
                            <i data-lucide="download" style="width:13px;height:13px;"></i>
                        </button>
                        <div class="action-dropdown-menu download-menu" data-id="${msg.id}">
                            <button class="action-dropdown-item download-txt" data-id="${msg.id}">TXT</button>
                            <button class="action-dropdown-item download-md" data-id="${msg.id}">Markdown</button>
                            <button class="action-dropdown-item download-pdf" data-id="${msg.id}">PDF</button>
                        </div>
                    </div>
                    
                    <button class="msg-action-btn regenerate-btn" data-id="${msg.id}" title="Regenerate Response">
                        <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>
                    </button>
                    
                    <!-- Share Dropdown Menu -->
                    <div class="action-dropdown-container">
                        <button class="msg-action-btn share-trigger-btn" data-id="${msg.id}" title="Share Chat">
                            <i data-lucide="share-2" style="width:13px;height:13px;"></i>
                        </button>
                        <div class="action-dropdown-menu share-menu" data-id="${msg.id}">
                            <button class="action-dropdown-item share-link" data-id="${msg.id}">Copy Link</button>
                            <button class="action-dropdown-item share-html" data-id="${msg.id}">Export HTML</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
        attachmentsHtml = '<div class="message-attachments">';
        msg.attachments.forEach(att => {
            const name = att.name;
            const url = att.url;
            const type = att.type || '';
            if (type.startsWith('image/')) {
                attachmentsHtml += `
                    <a href="${url}" target="_blank" class="message-attachment-item">
                        <img src="${url}" alt="${name}">
                        <span>${escapeHtml(name)}</span>
                    </a>
                `;
            } else {
                attachmentsHtml += `
                    <a href="${url}" target="_blank" class="message-attachment-item">
                        <i data-lucide="file" style="width:12px;height:12px;"></i>
                        <span>${escapeHtml(name)}</span>
                    </a>
                `;
            }
        });
        attachmentsHtml += '</div>';
    }
    
    bubble.innerHTML = `
        <div class="message-avatar">
            <span>${avatarLabel}</span>
        </div>
        <div class="message-content-wrapper">
            <div class="message-bubble-body" id="body-${msg.id}">
                ${formattedContent}
            </div>
            ${attachmentsHtml}
            ${actionToolbarHtml}
        </div>
    `;
    
    elements.messagesList.appendChild(bubble);
    
    if (!isUser) {
        const btnCopy = bubble.querySelector('.copy-btn');
        if (btnCopy) btnCopy.addEventListener('click', () => copyMessageToClipboard(msg.id));
        
        const btnRegen = bubble.querySelector('.regenerate-btn');
        if (btnRegen) btnRegen.addEventListener('click', () => regenerateLastResponse());
        
        const btnPlay = bubble.querySelector('.speak-play-btn');
        if (btnPlay) btnPlay.addEventListener('click', () => speakMessage(msg.id));
        
        const btnPause = bubble.querySelector('.speak-pause-btn');
        if (btnPause) btnPause.addEventListener('click', () => pauseSpeech(msg.id));
        
        const btnStop = bubble.querySelector('.speak-stop-btn');
        if (btnStop) btnStop.addEventListener('click', () => stopActiveSpeech());
        
        // Premium Download options
        const btnTxt = bubble.querySelector('.download-txt');
        if (btnTxt) btnTxt.addEventListener('click', () => downloadResponseAsTxt(msg.id));
        const btnMd = bubble.querySelector('.download-md');
        if (btnMd) btnMd.addEventListener('click', () => downloadResponseAsMd(msg.id));
        const btnPdf = bubble.querySelector('.download-pdf');
        if (btnPdf) btnPdf.addEventListener('click', () => downloadResponseAsPdf(msg.id));
        
        // Premium Share options
        const btnShareLink = bubble.querySelector('.share-link');
        if (btnShareLink) btnShareLink.addEventListener('click', () => shareConversationLink());
        const btnShareHtml = bubble.querySelector('.share-html');
        if (btnShareHtml) btnShareHtml.addEventListener('click', () => exportConversationAsHtml());
        
        safeHighlightUnder(bubble);
    }
    safeCreateIcons();
}

function copyMessageToClipboard(msgId) {
    const body = document.getElementById(`body-${msgId}`);
    if (!body) return;
    
    const text = body.innerText || body.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Response copied to clipboard!');
    }).catch(err => {
        console.error('Error copying text:', err);
    });
}

function copyCodeBlockText(btn) {
    const codeId = btn.getAttribute('data-code-id');
    const codeBlock = document.getElementById(codeId);
    if (!codeBlock) return;
    
    const text = codeBlock.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Code copied!');
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = 'Copy';
        }, 2000);
    }).catch(err => {
        console.error('Error copying code:', err);
    });
}

function exportCurrentChat() {
    if (!activeConversationId) return;
    
    const link = document.createElement('a');
    link.href = `/api/conversations/${activeConversationId}/export`;
    link.click();
    showToast('Exporting conversation...');
}

function exportAllChats() {
    const link = document.createElement('a');
    link.href = '/api/conversations/export_all';
    link.click();
    showToast('Exporting all chats...');
}

// Copy code click delegation
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-copy-code');
    if (btn) {
        copyCodeBlockText(btn);
    }
});

function scrollToBottom() {
    if (elements.messagesContainer) {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }
}

function toggleInputState(disabled) {
    if (elements.chatInput) elements.chatInput.disabled = disabled;
    if (elements.btnSend) elements.btnSend.disabled = disabled || (elements.chatInput && elements.chatInput.value.trim().length === 0);
    if (!disabled && elements.chatInput) {
        elements.chatInput.focus();
    }
}

// Toast Alert Messages
function showToast(message) {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
    `;
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 2500);
}

// Event Listeners Wire-up
function setupEventListeners() {
    // Toggle Sidebar Drawer
    if (elements.btnSidebarToggle) {
        elements.btnSidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (elements.sidebarDrawer) elements.sidebarDrawer.classList.toggle('open');
            if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.toggle('show');
        });
    }
    
    // Close Sidebar Drawer by Backdrop click
    if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.addEventListener('click', () => {
            closeSidebar();
        });
    }
    
    if (elements.btnThemeToggle) {
        elements.btnThemeToggle.addEventListener('click', () => {
            const nextTheme = userSettings.theme === 'dark' ? 'light' : 'dark';
            userSettings.theme = nextTheme;
            localStorage.setItem('settings_theme', nextTheme);
            applySettings();
            showToast(`Theme changed to ${nextTheme}`);
        });
    }
    
    if (elements.btnNewChat) elements.btnNewChat.addEventListener('click', createNewConversation);
    
    if (elements.btnRenameActive) {
        elements.btnRenameActive.addEventListener('click', () => {
            if (!activeConversationId) return;
            const conv = conversations.find(c => c.id === activeConversationId);
            if (conv) {
                renameConversationPrompt(conv.id, conv.title);
            }
        });
    }
    
    if (elements.btnDeleteActive) {
        elements.btnDeleteActive.addEventListener('click', () => {
            if (activeConversationId) {
                openDeleteModal(activeConversationId);
            }
        });
    }
    
    if (elements.btnExportChat) elements.btnExportChat.addEventListener('click', exportCurrentChat);
    
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value;
            searchTimeout = setTimeout(() => {
                loadConversations(query);
            }, 250);
        });
    }
    
    if (elements.chatInput) {
        elements.chatInput.addEventListener('input', () => {
            const text = elements.chatInput.value;
            if (elements.charCounter) elements.charCounter.textContent = `${text.length} / 5000`;
            
            elements.chatInput.style.height = 'auto';
            elements.chatInput.style.height = `${elements.chatInput.scrollHeight}px`;
            
            if (elements.btnSend) {
                elements.btnSend.disabled = text.trim().length === 0 || text.length > 5000 || isGenerating;
            }
        });
    }
    
    if (elements.btnSend) elements.btnSend.addEventListener('click', sendMessage);
    
    if (elements.chatInput) {
        elements.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (elements.chatInput.value.trim().length > 0 && !isGenerating) {
                    sendMessage();
                }
            }
        });
    }
    
    // Toggle Attach popover menu
    const btnAttach = document.getElementById('btn-attach');
    const attachMenu = document.getElementById('attach-menu');
    if (btnAttach && attachMenu) {
        btnAttach.addEventListener('click', (e) => {
            e.stopPropagation();
            attachMenu.classList.toggle('open');
        });
    }
    
    // Hide Attach popover menu when clicking anywhere else
    document.addEventListener('click', (e) => {
        if (attachMenu && !attachMenu.contains(e.target) && btnAttach && !btnAttach.contains(e.target)) {
            attachMenu.classList.remove('open');
        }
    });

    // Hidden File input upload trigger
    const btnUploadFile = document.getElementById('btn-upload-file');
    const fileUploader = document.getElementById('file-uploader');
    if (btnUploadFile && fileUploader) {
        btnUploadFile.addEventListener('click', () => {
            fileUploader.click();
            if (attachMenu) attachMenu.classList.remove('open');
        });
    }

    if (fileUploader) {
        fileUploader.addEventListener('change', () => {
            if (fileUploader.files.length > 0) {
                handleFileUpload(fileUploader.files);
            }
        });
    }

    // Webcam capture modal triggers
    const btnWebcam = document.getElementById('btn-webcam-capture');
    if (btnWebcam) {
        btnWebcam.addEventListener('click', () => {
            openWebcamModal();
            if (attachMenu) attachMenu.classList.remove('open');
        });
    }

    const btnCloseWebcam = document.getElementById('btn-close-webcam');
    const btnCloseWebcamX = document.getElementById('btn-close-webcam-x');
    if (btnCloseWebcam) btnCloseWebcam.addEventListener('click', closeWebcamModal);
    if (btnCloseWebcamX) btnCloseWebcamX.addEventListener('click', closeWebcamModal);

    const btnCapture = document.getElementById('btn-capture-snapshot');
    if (btnCapture) btnCapture.addEventListener('click', captureSnapshot);

    // Voice input recording
    const btnVoice = document.getElementById('btn-voice');
    if (btnVoice) {
        btnVoice.addEventListener('click', toggleVoiceDictation);
    }

    // Window Drag and Drop bindings
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        const overlay = document.getElementById('drag-drop-overlay');
        if (overlay) overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (e.relatedTarget === null || e.clientX === 0) {
            const overlay = document.getElementById('drag-drop-overlay');
            if (overlay) overlay.classList.remove('active');
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        const overlay = document.getElementById('drag-drop-overlay');
        if (overlay) overlay.classList.remove('active');
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files);
        }
    });

    // Window Clipboard Paste bindings
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        const files = [];
        for (let item of items) {
            if (item.kind === 'file') {
                files.push(item.getAsFile());
            }
        }
        if (files.length > 0) {
            handleFileUpload(files);
        }
    });

    if (elements.btnCancelModal) elements.btnCancelModal.addEventListener('click', closeDeleteModal);
    if (elements.btnCancelModalX) elements.btnCancelModalX.addEventListener('click', closeDeleteModal);
    if (elements.btnConfirmDeleteModal) elements.btnConfirmDeleteModal.addEventListener('click', confirmDeleteChat);
    
    if (elements.btnSettingsToggle) elements.btnSettingsToggle.addEventListener('click', openSettingsModal);
    if (elements.btnCloseSettings) elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetTab = btn.getAttribute('data-tab');
            const contents = document.querySelectorAll('.tab-content');
            contents.forEach(c => c.classList.remove('active'));
            const contentPanel = document.getElementById(`tab-${targetTab}`);
            if (contentPanel) contentPanel.classList.add('active');
        });
    });
    
    if (elements.settingsThemeSelect) {
        elements.settingsThemeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            userSettings.theme = val;
            localStorage.setItem('settings_theme', val);
            applySettings();
        });
    }
    
    if (elements.settingsFontSelect) {
        elements.settingsFontSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            userSettings.fontSize = val;
            localStorage.setItem('settings_font', val);
            applySettings();
            showToast(`Font size set to ${val}`);
        });
    }
    
    if (elements.settingsTypingToggle) {
        elements.settingsTypingToggle.addEventListener('change', (e) => {
            const val = e.target.checked;
            userSettings.typingAnimation = val;
            localStorage.setItem('settings_typing', val);
            showToast(`Typing animation ${val ? 'enabled' : 'disabled'}`);
        });
    }
    
    if (elements.settingsMarkdownToggle) {
        elements.settingsMarkdownToggle.addEventListener('change', (e) => {
            const val = e.target.checked;
            userSettings.markdownEnabled = val;
            localStorage.setItem('settings_markdown', val);
            showToast(`Markdown rendering ${val ? 'enabled' : 'disabled'}`);
            if (activeConversationId) {
                selectConversation(activeConversationId);
            }
        });
    }
    
    if (elements.settingsModelSelect) {
        elements.settingsModelSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            userSettings.aiModel = val;
            localStorage.setItem('settings_model', val);
            showToast(`Model set to ${val}`);
        });
    }
    
    if (elements.btnSettingsExportAll) elements.btnSettingsExportAll.addEventListener('click', exportAllChats);
    if (elements.btnSettingsClearAll) elements.btnSettingsClearAll.addEventListener('click', clearAllConversations);
    
    // Global keyboard shortcuts (Ctrl+N, Ctrl+K, Ctrl+L, Esc)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            createNewConversation();
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (elements.searchInput) {
                elements.searchInput.focus();
                if (elements.sidebarDrawer && !elements.sidebarDrawer.classList.contains('open')) {
                    elements.sidebarDrawer.classList.add('open');
                    if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.add('show');
                }
                showToast('Search focused');
            }
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            if (elements.chatInput) {
                elements.chatInput.value = '';
                elements.chatInput.dispatchEvent(new Event('input'));
                showToast('Input cleared');
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeDeleteModal();
            closeWebcamModal();
            closeShortcutsModal();
            if (elements.sidebarDrawer && elements.sidebarDrawer.classList.contains('open')) {
                elements.sidebarDrawer.classList.remove('open');
                if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('show');
            }
        }
    });

    // Delegation listener for download / share trigger buttons
    document.addEventListener('click', (e) => {
        const openMenus = document.querySelectorAll('.action-dropdown-menu');
        const trigger = e.target.closest('.download-trigger-btn, .share-trigger-btn');
        if (trigger) {
            e.stopPropagation();
            const container = trigger.closest('.action-dropdown-container');
            const menu = container.querySelector('.action-dropdown-menu');
            const wasOpen = menu.classList.contains('open');
            openMenus.forEach(m => m.classList.remove('open'));
            if (!wasOpen) {
                menu.classList.add('open');
            }
        } else {
            openMenus.forEach(m => m.classList.remove('open'));
        }
    });

    // Stop Generating button
    const btnStopGen = document.getElementById('btn-stop-generating');
    if (btnStopGen) {
        btnStopGen.addEventListener('click', () => {
            if (activeAbortController) {
                activeAbortController.abort();
                showToast("Generation stopped.");
            }
        });
    }

    // Shortcuts modal triggers
    const btnShortcuts = document.getElementById('btn-shortcuts-toggle');
    if (btnShortcuts) btnShortcuts.addEventListener('click', openShortcutsModal);
    
    const btnCloseShortcuts = document.getElementById('btn-close-shortcuts');
    const btnCloseShortcutsX = document.getElementById('btn-close-shortcuts-x');
    if (btnCloseShortcuts) btnCloseShortcuts.addEventListener('click', closeShortcutsModal);
    if (btnCloseShortcutsX) btnCloseShortcutsX.addEventListener('click', closeShortcutsModal);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// File Upload list state
let fileUploadQueue = [];
let uploadCount = 0;

function handleFileUpload(files) {
    Array.from(files).forEach(file => {
        uploadCount++;
        const tempId = 'upload-temp-' + uploadCount;
        
        // Show immediate preview chip with a progress bar
        const previewsContainer = document.getElementById('attachment-previews-list');
        if (!previewsContainer) return;
        
        const chip = document.createElement('div');
        chip.className = 'preview-chip';
        chip.id = tempId;
        
        let fileIconHtml = '<i data-lucide="file" style="width:12px;height:12px;"></i>';
        if (file.type.startsWith('image/')) {
            const previewUrl = URL.createObjectURL(file);
            fileIconHtml = `<img src="${previewUrl}" alt="${file.name}">`;
        }
        
        chip.innerHTML = `
            ${fileIconHtml}
            <span>${escapeHtml(file.name)}</span>
            <button class="preview-chip-remove" onclick="removePreviewBeforeUpload('${tempId}')" title="Cancel Upload">
                <i data-lucide="x" style="width:12px;height:12px;"></i>
            </button>
            <div class="upload-progress-bar" id="progress-${tempId}"></div>
        `;
        previewsContainer.appendChild(chip);
        safeCreateIcons();
        
        // Upload file via XHR to display real-time progress
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', file.type);
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const progressBar = document.getElementById(`progress-${tempId}`);
                if (progressBar) progressBar.style.width = `${percent}%`;
            }
        });
        
        xhr.onload = () => {
            if (xhr.status === 201) {
                const data = JSON.parse(xhr.responseText);
                // Push completed metadata to queue
                fileUploadQueue.push(data);
                
                // Update remove action to delete from completed queue
                const completedChip = document.getElementById(tempId);
                if (completedChip) {
                    const removeBtn = completedChip.querySelector('.preview-chip-remove');
                    if (removeBtn) {
                        removeBtn.setAttribute('onclick', `removeUploadedAttachment('${data.id}')`);
                    }
                    const pBar = document.getElementById(`progress-${tempId}`);
                    if (pBar) pBar.style.display = 'none'; // hide progress bar on done
                }
                
                // Enable send button if we have attachments and text, or toggle send status
                if (elements.btnSend && elements.chatInput) {
                    elements.btnSend.disabled = isGenerating;
                }
            } else {
                showToast(`Failed to upload ${file.name}`);
                const failedChip = document.getElementById(tempId);
                if (failedChip) failedChip.remove();
            }
        };
        
        xhr.onerror = () => {
            showToast(`Upload error for ${file.name}`);
            const failedChip = document.getElementById(tempId);
            if (failedChip) failedChip.remove();
        };
        
        xhr.send(formData);
    });
}

function removePreviewBeforeUpload(tempId) {
    const chip = document.getElementById(tempId);
    if (chip) chip.remove();
}

function removeUploadedAttachment(fileId) {
    fileUploadQueue = fileUploadQueue.filter(item => item.id !== fileId);
    renderAttachmentPreviews();
}

function renderAttachmentPreviews() {
    const previewsContainer = document.getElementById('attachment-previews-list');
    if (!previewsContainer) return;
    previewsContainer.innerHTML = '';
    
    fileUploadQueue.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'preview-chip';
        chip.id = `upload-done-${item.id}`;
        
        let fileIconHtml = '<i data-lucide="file" style="width:12px;height:12px;"></i>';
        if (item.type.startsWith('image/')) {
            fileIconHtml = `<img src="${item.url}" alt="${item.name}">`;
        }
        
        chip.innerHTML = `
            ${fileIconHtml}
            <span>${escapeHtml(item.name)}</span>
            <button class="preview-chip-remove" onclick="removeUploadedAttachment('${item.id}')" title="Remove Attachment">
                <i data-lucide="x" style="width:12px;height:12px;"></i>
            </button>
        `;
        previewsContainer.appendChild(chip);
    });
    safeCreateIcons();
}

// Webcam Snapshot Controller
let webcamStream = null;

function openWebcamModal() {
    const modal = document.getElementById('webcam-modal');
    if (!modal) return;
    modal.classList.add('open');
    
    const video = document.getElementById('webcam-video');
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
            webcamStream = stream;
            if (video) video.srcObject = stream;
        })
        .catch(err => {
            console.error("Camera access failed:", err);
            showToast("Webcam access denied or unavailable.");
            closeWebcamModal();
        });
}

function closeWebcamModal() {
    const modal = document.getElementById('webcam-modal');
    if (modal) modal.classList.remove('open');
    
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    
    const video = document.getElementById('webcam-video');
    if (video) video.srcObject = null;
}

function captureSnapshot() {
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    if (!video || !canvas) return;
    
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    
    canvas.toBlob((blob) => {
        if (blob) {
            const file = new File([blob], `snapshot_${Date.now()}.jpg`, { type: 'image/jpeg' });
            handleFileUpload([file]);
            closeWebcamModal();
            showToast("Webcam snapshot captured successfully!");
        }
    }, 'image/jpeg', 0.9);
}

// Voice Dictation (Speech-to-Text) Controller
let voiceRecognition = null;
let isRecordingVoice = false;

// Initialize Speech Recognition if supported
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRec) {
    voiceRecognition = new SpeechRec();
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = true;
    voiceRecognition.lang = 'en-US';
    
    voiceRecognition.onresult = (e) => {
        let finalTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
                finalTranscript += e.results[i][0].transcript;
            }
        }
        if (finalTranscript) {
            if (elements.chatInput) {
                elements.chatInput.value += (elements.chatInput.value ? ' ' : '') + finalTranscript;
                elements.chatInput.dispatchEvent(new Event('input'));
            }
        }
    };
    
    voiceRecognition.onerror = (e) => {
        console.error("Speech recognition error:", e.error);
        if (e.error === 'not-allowed') {
            showToast("Microphone access denied.");
        }
        stopVoiceDictation();
    };
    
    voiceRecognition.onend = () => {
        isRecordingVoice = false;
        const voiceIcon = document.getElementById('voice-icon');
        if (voiceIcon) {
            voiceIcon.classList.remove('voice-recording-pulse');
            voiceIcon.setAttribute('data-lucide', 'mic');
        }
        safeCreateIcons();
    };
}

function toggleVoiceDictation() {
    if (!voiceRecognition) {
        showToast("Speech dictation not supported by this browser.");
        return;
    }
    
    if (isRecordingVoice) {
        stopVoiceDictation();
    } else {
        startVoiceDictation();
    }
}

function startVoiceDictation() {
    if (!voiceRecognition) return;
    try {
        voiceRecognition.start();
        isRecordingVoice = true;
        showToast("Recording... speak now.");
        
        const voiceIcon = document.getElementById('voice-icon');
        if (voiceIcon) {
            voiceIcon.classList.add('voice-recording-pulse');
            voiceIcon.setAttribute('data-lucide', 'mic-off');
        }
        safeCreateIcons();
    } catch (e) {
        console.error("Failed to start voice dictation:", e);
    }
}

function stopVoiceDictation() {
    if (!voiceRecognition) return;
    try {
        voiceRecognition.stop();
        isRecordingVoice = false;
        showToast("Recording stopped.");
        
        const voiceIcon = document.getElementById('voice-icon');
        if (voiceIcon) {
            voiceIcon.classList.remove('voice-recording-pulse');
            voiceIcon.setAttribute('data-lucide', 'mic');
        }
        safeCreateIcons();
    } catch (e) {
        console.error("Failed to stop voice dictation:", e);
    }
}
// Premium Downloads Controllers
function downloadResponseAsTxt(msgId) {
    const raw = activeChatMessages[msgId] || '';
    if (!raw) {
        showToast("Error retrieving message content");
        return;
    }
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `assistant_response_${msgId.substring(0,8)}.txt`;
    link.click();
    showToast("Downloaded TXT file");
}

function downloadResponseAsMd(msgId) {
    const raw = activeChatMessages[msgId] || '';
    if (!raw) {
        showToast("Error retrieving message content");
        return;
    }
    const blob = new Blob([raw], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `assistant_response_${msgId.substring(0,8)}.md`;
    link.click();
    showToast("Downloaded Markdown file");
}

function downloadResponseAsPdf(msgId) {
    const raw = activeChatMessages[msgId] || '';
    if (!raw) {
        showToast("Error retrieving message content");
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        
        const textLines = doc.splitTextToSize(raw, 180);
        doc.text(textLines, 15, 15);
        doc.save(`assistant_response_${msgId.substring(0,8)}.pdf`);
        showToast("Downloaded PDF file");
    } catch (e) {
        console.error("PDF generation error:", e);
        showToast("Failed to compile PDF");
    }
}

// Premium Sharing Controllers
async function shareConversationLink() {
    if (!activeConversationId) return;
    
    try {
        const res = await fetch(`/api/conversations/${activeConversationId}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok) {
            navigator.clipboard.writeText(data.share_url).then(() => {
                showToast("Share link copied to clipboard!");
            }).catch(err => {
                console.error("Failed to copy share link:", err);
                showToast(`Share URL: ${data.share_url}`);
            });
        } else {
            showToast("Failed to generate share link");
        }
    } catch (e) {
        console.error("Error sharing chat:", e);
        showToast("Sharing connection failed");
    }
}

function exportConversationAsHtml() {
    if (!activeConversationId) return;
    const link = document.createElement('a');
    link.href = `/api/conversations/${activeConversationId}/export_html`;
    link.click();
    showToast("Downloading self-contained chat log...");
}

// Premium Keyboard Shortcuts Modal
function openShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.add('open');
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.remove('open');
}
