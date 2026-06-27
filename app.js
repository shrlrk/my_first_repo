// app.js - Main Application Logic
import { auth, todos, isFirebaseActive, getFirebaseConfig, saveFirebaseConfig, deleteFirebaseConfig } from './db.js';

// State Management
let currentUser = null;
let tasksList = [];
let activeCategory = 'all';
let activeFilter = 'all';
let searchQuery = '';
let sortBy = 'createdAt-desc';
let activeUnsubscribe = null;

// DOM Elements
const profileCard = document.getElementById('profileCard');
const profileInitials = document.getElementById('profileInitials');
const profileGreeting = document.getElementById('profileGreeting');
const profileUsername = document.getElementById('profileUsername');
const authToggleBtn = document.getElementById('authToggleBtn');
const authIcon = document.getElementById('authIcon');

const categoryItems = document.querySelectorAll('.category-list .category-item');
const progressRingCircle = document.getElementById('progressRingCircle');
const progressPercentage = document.getElementById('progressPercentage');
const highPriorityCount = document.getElementById('high-priority-count');
const mediumPriorityCount = document.getElementById('medium-priority-count');
const lowPriorityCount = document.getElementById('low-priority-count');

const dbStatusBadge = document.getElementById('dbStatusBadge');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const settingsTriggerBtn = document.getElementById('settingsTriggerBtn');

const currentDateDisplay = document.getElementById('currentDateDisplay');
const searchInput = document.getElementById('searchInput');

const summaryTotal = document.getElementById('summary-total');
const summaryActive = document.getElementById('summary-active');
const summaryCompleted = document.getElementById('summary-completed');
const summaryOverdue = document.getElementById('summary-overdue');

const taskForm = document.getElementById('taskForm');
const taskTextInput = document.getElementById('taskTextInput');
const taskCategorySelect = document.getElementById('taskCategorySelect');
const taskDueDateInput = document.getElementById('taskDueDateInput');
const priorityRadios = document.querySelectorAll('input[name="priority"]');

const filterTabs = document.querySelectorAll('.filter-tabs .filter-tab');
const sortSelector = document.getElementById('sortSelector');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const tasksListContainer = document.getElementById('tasksList');
const emptyState = document.getElementById('emptyState');

// Modals
const authModal = document.getElementById('authModal');
const authModalCloseBtn = document.getElementById('authModalCloseBtn');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabRegisterBtn = document.getElementById('tabRegisterBtn');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const anonAuthBtn = document.getElementById('anonAuthBtn');

const settingsModal = document.getElementById('settingsModal');
const settingsModalCloseBtn = document.getElementById('settingsModalCloseBtn');
const firebaseConfigForm = document.getElementById('firebaseConfigForm');
const resetConfigBtn = document.getElementById('resetConfigBtn');

// Sound Element
const completionSound = document.getElementById('completionSound');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

/* ==========================================================================
   TOAST SYSTEM
   ========================================================================== */

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'error') iconName = 'alert-circle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  lucide.createIcons();
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ==========================================================================
   INITIALIZATION & AUTH OBSERVER
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Update Date
  const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  currentDateDisplay.textContent = new Date().toLocaleDateString('ko-KR', dateOptions);

  // Initialize DB Connection Status Indicator
  if (isFirebaseActive) {
    statusDot.className = 'status-indicator-dot firebase';
    statusText.textContent = 'Firebase 실시간 연동';
  } else {
    statusDot.className = 'status-indicator-dot local';
    statusText.textContent = '데모 모드 (로컬 저장)';
  }

  // Set default due date to empty
  taskDueDateInput.value = '';

  // Setup Event Listeners
  setupEventListeners();

  // Watch Auth State
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      updateUserUI(user);
      subscribeToTasks(user.uid);
    } else {
      // Automatic Silent Anonymous Auth for seamless Demo mode
      console.log('No user session. Auto-signing in anonymously...');
      auth.signInAnonymously().catch(err => {
        console.error('Failed auto anonymous auth:', err);
        openModal(authModal);
      });
    }
  });
});

/* ==========================================================================
   EVENT LISTENERS SETUP
   ========================================================================== */

function setupEventListeners() {
  // Category Selection in Sidebar
  categoryItems.forEach(item => {
    item.addEventListener('click', () => {
      categoryItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      activeCategory = item.dataset.category;
      renderTasks();
    });
  });

  // Task Creator Priority Radios Active State Styling
  priorityRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.priority-opt').forEach(opt => opt.classList.remove('active'));
      radio.closest('.priority-opt').classList.add('active');
    });
  });

  // Filter Tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      activeFilter = tab.dataset.filter;
      renderTasks();
    });
  });

  // Sorting
  sortSelector.addEventListener('change', (e) => {
    sortBy = e.target.value;
    renderTasks();
  });

  // Search Input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTasks();
  });

  // Task Creation Form Submit
  taskForm.addEventListener('submit', handleTaskSubmit);

  // Clear Completed Tasks
  clearCompletedBtn.addEventListener('click', handleClearCompleted);

  // Auth Modal Trigger & Toggles
  authToggleBtn.addEventListener('click', () => {
    if (currentUser && !currentUser.isAnonymous) {
      // Registered User signs out
      auth.signOut()
        .then(() => showToast('로그아웃 되었습니다.', 'info'))
        .catch(err => showToast(`로그아웃 실패: ${err.message}`, 'error'));
    } else {
      // Guest or Unauthenticated triggers login modal
      openModal(authModal);
    }
  });

  // Modal tab toggle (Login vs Register)
  tabLoginBtn.addEventListener('click', () => {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabRegisterBtn.addEventListener('click', () => {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  // Close modals
  authModalCloseBtn.addEventListener('click', () => closeModal(authModal));
  settingsModalCloseBtn.addEventListener('click', () => closeModal(settingsModal));

  // Forms Submissions
  loginForm.addEventListener('submit', handleLoginSubmit);
  registerForm.addEventListener('submit', handleRegisterSubmit);
  anonAuthBtn.addEventListener('click', handleAnonAuth);

  // Firebase Config Modal Actions
  settingsTriggerBtn.addEventListener('click', () => {
    const config = getFirebaseConfig();
    if (config) {
      document.getElementById('cfgApiKey').value = config.apiKey || '';
      document.getElementById('cfgAuthDomain').value = config.authDomain || '';
      document.getElementById('cfgProjectId').value = config.projectId || '';
      document.getElementById('cfgStorageBucket').value = config.storageBucket || '';
      document.getElementById('cfgMessagingSenderId').value = config.messagingSenderId || '';
      document.getElementById('cfgAppId').value = config.appId || '';
    }
    openModal(settingsModal);
  });

  firebaseConfigForm.addEventListener('submit', handleConfigSave);
  resetConfigBtn.addEventListener('click', handleConfigReset);
}

/* ==========================================================================
   AUTH ACTIONS
   ========================================================================== */

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast('성공적으로 로그인되었습니다.', 'success');
    closeModal(authModal);
    loginForm.reset();
  } catch (err) {
    showToast(`로그인 실패: ${err.message}`, 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  
  try {
    await auth.createUserWithEmailAndPassword(email, password, name);
    showToast('회원가입 및 로그인이 완료되었습니다.', 'success');
    closeModal(authModal);
    registerForm.reset();
  } catch (err) {
    showToast(`회원가입 실패: ${err.message}`, 'error');
  }
}

async function handleAnonAuth() {
  try {
    await auth.signInAnonymously();
    showToast('임시 게스트 계정으로 로그인했습니다.', 'info');
    closeModal(authModal);
  } catch (err) {
    showToast(`게스트 로그인 실패: ${err.message}`, 'error');
  }
}

function updateUserUI(user) {
  profileGreeting.textContent = user.isAnonymous ? '게스트 로그인 중' : '안녕하세요!';
  profileUsername.textContent = user.displayName || user.email || '사용자';
  
  // Extract initial
  const initial = (user.displayName || 'G')[0].toUpperCase();
  profileInitials.textContent = initial;

  if (user.isAnonymous) {
    // Show login icon
    authIcon.setAttribute('data-lucide', 'log-in');
    authToggleBtn.title = '로그인/회원가입';
  } else {
    // Show logout icon
    authIcon.setAttribute('data-lucide', 'log-out');
    authToggleBtn.title = '로그아웃';
  }
  lucide.createIcons();
}

/* ==========================================================================
   TASK OPERATIONS (REAL-TIME SUBSCRIPTION & MUTATIONS)
   ========================================================================== */

function subscribeToTasks(userId) {
  // Clean previous subscriptions if any
  if (activeUnsubscribe) {
    activeUnsubscribe();
  }

  // Set up new database listener
  activeUnsubscribe = todos.subscribe(userId, (data) => {
    tasksList = data;
    renderTasks();
    updateDashboard();
  });
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast('할 일을 추가하려면 로그인이 필요합니다.', 'warning');
    return;
  }

  const text = taskTextInput.value.trim();
  const category = taskCategorySelect.value;
  const dueDate = taskDueDateInput.value || null;
  const priority = document.querySelector('input[name="priority"]:checked').value;

  if (!text) return;

  try {
    await todos.add(currentUser.uid, { text, category, dueDate, priority });
    showToast('할 일이 성공적으로 추가되었습니다.', 'success');
    
    // Reset inputs
    taskTextInput.value = '';
    taskDueDateInput.value = '';
    
    // Focus text input again
    taskTextInput.focus();
  } catch (err) {
    showToast(`할 일 추가 실패: ${err.message}`, 'error');
  }
}

async function handleTaskToggle(taskId, completed) {
  try {
    await todos.update(currentUser.uid, taskId, { completed });
    
    if (completed) {
      // Play clean completion chime
      if (completionSound) {
        completionSound.currentTime = 0;
        completionSound.play().catch(() => {});
      }
      
      // Celebrate if everything is completed and tasks exists
      const activeCount = tasksList.filter(t => !t.completed).length;
      if (activeCount === 0 && tasksList.length > 0) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.65 },
          colors: ['#a78bfa', '#8b5cf6', '#10b981', '#3b82f6', '#f59e0b']
        });
        showToast('🎉 오늘의 작업을 모두 완료했습니다! 대단해요!', 'success');
      } else {
        showToast('작업을 완료했습니다.', 'success');
      }
    }
  } catch (err) {
    showToast(`작업 상태 변경 실패: ${err.message}`, 'error');
  }
}

async function handleTaskDelete(taskId) {
  try {
    await todos.delete(currentUser.uid, taskId);
    showToast('할 일이 삭제되었습니다.', 'warning');
  } catch (err) {
    showToast(`삭제 실패: ${err.message}`, 'error');
  }
}

async function handleTaskTextUpdate(taskId, oldText, newText) {
  if (!newText.trim() || newText === oldText) return;
  
  try {
    await todos.update(currentUser.uid, taskId, { text: newText.trim() });
    showToast('할 일 내용이 변경되었습니다.', 'info');
  } catch (err) {
    showToast(`내용 변경 실패: ${err.message}`, 'error');
  }
}

async function handleClearCompleted() {
  if (!currentUser) return;
  
  const completedCount = tasksList.filter(t => t.completed).length;
  if (completedCount === 0) {
    showToast('삭제할 완료 항목이 없습니다.', 'info');
    return;
  }

  if (confirm('완료된 할 일을 모두 삭제하시겠습니까?')) {
    try {
      await todos.clearCompleted(currentUser.uid);
      showToast(`${completedCount}개의 완료된 할 일을 삭제했습니다.`, 'warning');
    } catch (err) {
      showToast(`삭제 실패: ${err.message}`, 'error');
    }
  }
}

/* ==========================================================================
   RENDERING ENGINE (DYNAMIC DOM POPULATOR)
   ========================================================================== */

function renderTasks() {
  tasksListContainer.innerHTML = '';
  
  // 1. Filtering
  let filtered = [...tasksList];

  // Category Filter
  if (activeCategory !== 'all') {
    filtered = filtered.filter(task => task.category === activeCategory);
  }

  // Completion Tab Filter
  if (activeFilter === 'active') {
    filtered = filtered.filter(task => !task.completed);
  } else if (activeFilter === 'completed') {
    filtered = filtered.filter(task => task.completed);
  }

  // Search Filter
  if (searchQuery) {
    filtered = filtered.filter(task => task.text.toLowerCase().includes(searchQuery));
  }

  // 2. Sorting
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  
  filtered.sort((a, b) => {
    if (sortBy === 'createdAt-desc') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    if (sortBy === 'createdAt-asc') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (sortBy === 'dueDate-asc') {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    }
    if (sortBy === 'priority-desc') {
      const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt) - new Date(a.createdAt); // Secondary sort: Newest
    }
    return 0;
  });

  // Render Logic
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    
    filtered.forEach(task => {
      const taskEl = createTaskCard(task);
      tasksListContainer.appendChild(taskEl);
    });
  }

  // Update Category Badge Counters in Sidebar
  updateCategoryCounts();
  lucide.createIcons();
}

function createTaskCard(task) {
  const isOverdue = task.dueDate && !task.completed && task.dueDate < new Date().toISOString().split('T')[0];
  
  const card = document.createElement('div');
  card.className = `task-item ${task.completed ? 'completed' : ''}`;
  card.id = `task-${task.id}`;
  
  // Format Date display
  let dateBadgeHTML = '';
  if (task.dueDate) {
    const formattedDate = new Date(task.dueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    dateBadgeHTML = `
      <span class="task-badge due-date ${isOverdue ? 'overdue' : ''}">
        <i data-lucide="calendar" class="badge-icon"></i>
        <span>${formattedDate}${isOverdue ? ' (기한 경과)' : ''}</span>
      </span>
    `;
  }

  // Map Category names
  const categoryLabels = {
    work: '업무',
    personal: '개인',
    shopping: '쇼핑',
    health: '건강/운동',
    ideas: '아이디어'
  };
  const categoryIcons = {
    work: 'briefcase',
    personal: 'user',
    shopping: 'shopping-cart',
    health: 'activity',
    ideas: 'lightbulb'
  };

  const priorityLabels = { high: '높음', medium: '보통', low: '낮음' };

  card.innerHTML = `
    <!-- Checkbox -->
    <label class="task-checkbox-wrapper">
      <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="할 일 완료 체크">
      <span class="custom-checkbox">
        <i data-lucide="check" class="check-icon"></i>
      </span>
    </label>

    <!-- Details -->
    <div class="task-content-details">
      <span class="task-text-span">${escapeHTML(task.text)}</span>
      <div class="task-meta-info">
        <!-- Category Badge -->
        <span class="task-badge category">
          <i data-lucide="${categoryIcons[task.category] || 'tag'}" class="badge-icon"></i>
          <span>${categoryLabels[task.category] || task.category}</span>
        </span>
        <!-- Priority Badge -->
        <span class="task-badge prio-${task.priority}">
          <span>우선순위: ${priorityLabels[task.priority]}</span>
        </span>
        <!-- Due Date Badge -->
        ${dateBadgeHTML}
      </div>
    </div>

    <!-- Actions -->
    <div class="task-item-actions">
      <button class="action-btn edit-btn" title="수정" aria-label="수정">
        <i data-lucide="edit-3" class="action-btn-icon"></i>
      </button>
      <button class="action-btn delete-btn" title="삭제" aria-label="삭제">
        <i data-lucide="trash-2" class="action-btn-icon"></i>
      </button>
    </div>
  `;

  // Bind checkbox toggle event
  const checkbox = card.querySelector('input[type="checkbox"]');
  checkbox.addEventListener('change', (e) => {
    handleTaskToggle(task.id, e.target.checked);
  });

  // Bind deletion
  const deleteBtn = card.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', () => {
    handleTaskDelete(task.id);
  });

  // Bind inline edit trigger
  const editBtn = card.querySelector('.edit-btn');
  const textSpan = card.querySelector('.task-text-span');
  
  function triggerEdit() {
    if (task.completed) return; // Disallow editing completed items
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-inline-edit';
    input.value = task.text;
    
    // Replace text element with input
    textSpan.replaceWith(input);
    input.focus();
    
    // Save function
    function saveEdit() {
      const val = input.value.trim();
      if (val && val !== task.text) {
        handleTaskTextUpdate(task.id, task.text, val);
      } else {
        // Revert
        input.replaceWith(textSpan);
      }
    }

    // Capture Enter key and blur
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveEdit();
      }
      if (e.key === 'Escape') {
        input.replaceWith(textSpan);
      }
    });
    
    input.addEventListener('blur', () => {
      saveEdit();
    });
  }

  editBtn.addEventListener('click', triggerEdit);
  textSpan.addEventListener('dblclick', triggerEdit);

  return card;
}

/* ==========================================================================
   DASHBOARD STATS CALCULATION
   ========================================================================== */

function updateDashboard() {
  const total = tasksList.length;
  const completed = tasksList.filter(t => t.completed).length;
  const active = total - completed;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const overdue = tasksList.filter(t => t.dueDate && !t.completed && t.dueDate < todayStr).length;

  // Update Mini Dashboard UI
  summaryTotal.textContent = total;
  summaryActive.textContent = active;
  summaryCompleted.textContent = completed;
  summaryOverdue.textContent = overdue;

  // Calculate circular completion percentage
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressPercentage.textContent = `${percentage}%`;

  // Draw circular SVG progress ring
  // Circumference: 2 * PI * r = 2 * Math.PI * 50 = 314.159
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  progressRingCircle.style.strokeDashoffset = offset;

  // Priority count badges (based on active tasks)
  const highActive = tasksList.filter(t => t.priority === 'high' && !t.completed).length;
  const mediumActive = tasksList.filter(t => t.priority === 'medium' && !t.completed).length;
  const lowActive = tasksList.filter(t => t.priority === 'low' && !t.completed).length;
  
  highPriorityCount.textContent = highActive;
  mediumPriorityCount.textContent = mediumActive;
  lowPriorityCount.textContent = lowActive;
}

function updateCategoryCounts() {
  // Count active tasks for each category
  const categories = ['work', 'personal', 'shopping', 'health', 'ideas'];
  
  // "All Tasks" gets total active tasks count
  const allActiveCount = tasksList.filter(t => !t.completed).length;
  document.getElementById('count-all').textContent = allActiveCount;

  categories.forEach(cat => {
    const count = tasksList.filter(t => t.category === cat && !t.completed).length;
    document.getElementById(`count-${cat}`).textContent = count;
  });
}

/* ==========================================================================
   FIREBASE CONFIG ACTIONS
   ========================================================================== */

function handleConfigSave(e) {
  e.preventDefault();
  
  const config = {
    apiKey: document.getElementById('cfgApiKey').value.trim(),
    authDomain: document.getElementById('cfgAuthDomain').value.trim(),
    projectId: document.getElementById('cfgProjectId').value.trim(),
    storageBucket: document.getElementById('cfgStorageBucket').value.trim(),
    messagingSenderId: document.getElementById('cfgMessagingSenderId').value.trim(),
    appId: document.getElementById('cfgAppId').value.trim()
  };

  try {
    saveFirebaseConfig(config);
    showToast('Firebase 설정이 저장되었습니다. 동기화를 위해 웹페이지를 재로딩합니다...', 'success');
    closeModal(settingsModal);
    
    // Reload to re-initialize SDK connection
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (err) {
    showToast(`설정 저장 오류: ${err.message}`, 'error');
  }
}

function handleConfigReset() {
  if (confirm('Firebase 설정을 초기화하고 Local DB (데모 모드)로 다시 실행하시겠습니까?')) {
    deleteFirebaseConfig();
    showToast('Firebase 연결을 해제했습니다. 페이지를 재로딩합니다...', 'warning');
    closeModal(settingsModal);
    
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }
}

/* ==========================================================================
   MODAL ACTIONS HELPER
   ========================================================================== */

function openModal(modal) {
  modal.classList.add('show');
}

function closeModal(modal) {
  modal.classList.remove('show');
}

/* ==========================================================================
   SECURITY HELPERS
   ========================================================================== */

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
