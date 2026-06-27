// db.js - Database and Auth Abstraction Layer

const MOCK_AUTH_STATE_KEY = 'nebula_mock_auth_state';
const MOCK_USERS_KEY = 'nebula_mock_users';
const MOCK_TODOS_KEY = 'nebula_mock_todos';
const CONFIG_KEY = 'nebula_firebase_config';

// Helper to retrieve Firebase configuration from LocalStorage
export function getFirebaseConfig() {
  try {
    const configStr = localStorage.getItem(CONFIG_KEY);
    if (configStr) {
      return JSON.parse(configStr);
    }
  } catch (e) {
    console.error('Failed to parse Firebase config:', e);
  }
  return null;
}

// Helper to save Firebase configuration to LocalStorage
export function saveFirebaseConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// Helper to remove Firebase configuration
export function deleteFirebaseConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

/* ==========================================================================
   MOCK SYSTEM (LocalStorage Fallback / "Demo Mode")
   ========================================================================== */

class MockAuth {
  constructor() {
    this.listeners = [];
    this.currentUser = null;
    
    const savedSession = localStorage.getItem(MOCK_AUTH_STATE_KEY);
    if (savedSession) {
      try {
        this.currentUser = JSON.parse(savedSession);
      } catch (e) {
        this.currentUser = null;
      }
    }
  }
  
  onAuthStateChanged(callback) {
    this.listeners.push(callback);
    // Immediately invoke with the current state
    setTimeout(() => callback(this.currentUser), 0);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
  
  _triggerStateChange() {
    if (this.currentUser) {
      localStorage.setItem(MOCK_AUTH_STATE_KEY, JSON.stringify(this.currentUser));
    } else {
      localStorage.removeItem(MOCK_AUTH_STATE_KEY);
    }
    this.listeners.forEach(callback => callback(this.currentUser));
  }
  
  async signInAnonymously() {
    const guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
    this.currentUser = {
      uid: guestId,
      email: null,
      displayName: '게스트 사용자',
      isAnonymous: true
    };
    this._triggerStateChange();
    return { user: this.currentUser };
  }
  
  async signInWithEmailAndPassword(email, password) {
    const users = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || '[]');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    this.currentUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      isAnonymous: false
    };
    this._triggerStateChange();
    return { user: this.currentUser };
  }
  
  async createUserWithEmailAndPassword(email, password, displayName) {
    const users = JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || '[]');
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('이미 등록된 이메일 주소입니다.');
    }
    const newUid = 'user_' + Math.random().toString(36).substr(2, 9);
    const newUser = { uid: newUid, email: email.toLowerCase(), password, displayName };
    users.push(newUser);
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
    
    this.currentUser = {
      uid: newUid,
      email: email.toLowerCase(),
      displayName,
      isAnonymous: false
    };
    this._triggerStateChange();
    return { user: this.currentUser };
  }
  
  async signOut() {
    this.currentUser = null;
    this._triggerStateChange();
  }
}

class MockTodos {
  constructor() {
    this.listeners = {}; // userId -> array of callbacks
  }
  
  _getTodos() {
    try {
      return JSON.parse(localStorage.getItem(MOCK_TODOS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  
  _saveTodos(todos) {
    localStorage.setItem(MOCK_TODOS_KEY, JSON.stringify(todos));
  }
  
  _notifySubscribers(userId) {
    if (this.listeners[userId]) {
      const allTodos = this._getTodos();
      const userTodos = allTodos
        .filter(todo => todo.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      this.listeners[userId].forEach(cb => cb(userTodos));
    }
  }
  
  subscribe(userId, callback) {
    if (!this.listeners[userId]) {
      this.listeners[userId] = [];
    }
    this.listeners[userId].push(callback);
    
    // Trigger initial data load
    const allTodos = this._getTodos();
    const userTodos = allTodos
      .filter(todo => todo.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setTimeout(() => callback(userTodos), 0);
    
    return () => {
      this.listeners[userId] = this.listeners[userId].filter(cb => cb !== callback);
    };
  }
  
  async add(userId, task) {
    const todos = this._getTodos();
    const newTodo = {
      id: 'todo_' + Math.random().toString(36).substr(2, 9),
      userId,
      text: task.text,
      completed: false,
      priority: task.priority || 'medium',
      category: task.category || 'personal',
      dueDate: task.dueDate || null,
      createdAt: new Date().toISOString()
    };
    todos.push(newTodo);
    this._saveTodos(todos);
    this._notifySubscribers(userId);
    return newTodo;
  }
  
  async update(userId, taskId, updates) {
    const todos = this._getTodos();
    const index = todos.findIndex(t => t.id === taskId && t.userId === userId);
    if (index !== -1) {
      todos[index] = { ...todos[index], ...updates };
      this._saveTodos(todos);
      this._notifySubscribers(userId);
    }
  }
  
  async delete(userId, taskId) {
    let todos = this._getTodos();
    todos = todos.filter(t => !(t.id === taskId && t.userId === userId));
    this._saveTodos(todos);
    this._notifySubscribers(userId);
  }
  
  async clearCompleted(userId) {
    let todos = this._getTodos();
    todos = todos.filter(t => !(t.userId === userId && t.completed));
    this._saveTodos(todos);
    this._notifySubscribers(userId);
  }
}

/* ==========================================================================
   FIREBASE SYSTEM WRAPPERS
   ========================================================================== */

class FirebaseAuthWrapper {
  constructor(auth, modules) {
    this.auth = auth;
    this.modules = modules;
  }
  
  onAuthStateChanged(callback) {
    return this.modules.onAuthStateChanged(this.auth, (user) => {
      if (user) {
        callback({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || (user.isAnonymous ? '게스트 사용자' : '사용자'),
          isAnonymous: user.isAnonymous
        });
      } else {
        callback(null);
      }
    });
  }
  
  async signInAnonymously() {
    return this.modules.signInAnonymously(this.auth);
  }
  
  async signInWithEmailAndPassword(email, password) {
    return this.modules.signInWithEmailAndPassword(this.auth, email, password);
  }
  
  async createUserWithEmailAndPassword(email, password, displayName) {
    const cred = await this.modules.createUserWithEmailAndPassword(this.auth, email, password);
    await this.modules.updateProfile(cred.user, { displayName });
    return cred;
  }
  
  async signOut() {
    return this.modules.signOut(this.auth);
  }
}

class FirebaseTodosWrapper {
  constructor(db, modules) {
    this.db = db;
    this.modules = modules;
  }
  
  subscribe(userId, callback) {
    const q = this.modules.query(
      this.modules.collection(this.db, 'todos'),
      this.modules.where('userId', '==', userId)
    );
    
    return this.modules.onSnapshot(q, (snapshot) => {
      const todos = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        todos.push({
          id: doc.id,
          ...data
        });
      });
      // Sort client-side to ensure ordering without needing Firestore composite indexes
      todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      callback(todos);
    }, (error) => {
      console.error("Firestore subscription error:", error);
    });
  }
  
  async add(userId, task) {
    const newTask = {
      userId,
      text: task.text,
      completed: false,
      priority: task.priority || 'medium',
      category: task.category || 'personal',
      dueDate: task.dueDate || null,
      createdAt: new Date().toISOString()
    };
    return this.modules.addDoc(this.modules.collection(this.db, 'todos'), newTask);
  }
  
  async update(userId, taskId, updates) {
    const docRef = this.modules.doc(this.db, 'todos', taskId);
    return this.modules.updateDoc(docRef, updates);
  }
  
  async delete(userId, taskId) {
    const docRef = this.modules.doc(this.db, 'todos', taskId);
    return this.modules.deleteDoc(docRef);
  }
  
  async clearCompleted(userId) {
    const q = this.modules.query(
      this.modules.collection(this.db, 'todos'),
      this.modules.where('userId', '==', userId),
      this.modules.where('completed', '==', true)
    );
    const querySnapshot = await this.modules.getDocs(q);
    
    const batch = this.modules.writeBatch(this.db);
    querySnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    return batch.commit();
  }
}

/* ==========================================================================
   INITIALIZATION / EXPORTS
   ========================================================================== */

let auth;
let todos;
let isFirebaseActive = false;

// Attempt to fetch env config from API first (local env or Vercel env)
let config = null;

try {
  const response = await fetch('/api/config');
  if (response.ok) {
    const apiConfig = await response.json();
    if (apiConfig && apiConfig.apiKey && apiConfig.projectId) {
      config = apiConfig;
      console.log('Nebula Tasks: Loaded Firebase config from environment variables.');
    }
  }
} catch (e) {
  // Silent fail - will fallback to local storage
}

// Fallback to LocalStorage config if API config is not found or invalid
if (!config) {
  config = getFirebaseConfig();
}

if (config) {
  try {
    // Dynamically load Firebase ES modules
    const appMod = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
    
    const firebaseApp = appMod.initializeApp(config);
    const firebaseAuth = authMod.getAuth(firebaseApp);
    const firebaseDb = dbMod.getFirestore(firebaseApp);
    
    auth = new FirebaseAuthWrapper(firebaseAuth, authMod);
    todos = new FirebaseTodosWrapper(firebaseDb, dbMod);
    isFirebaseActive = true;
    console.log('Nebula Tasks: Connected to Firebase.');
  } catch (err) {
    console.error('Nebula Tasks: Failed to initialize Firebase. Falling back to Demo Mode (LocalStorage).', err);
    auth = new MockAuth();
    todos = new MockTodos();
    isFirebaseActive = false;
  }
} else {
  // No Firebase configuration stored: Fallback to Mock
  auth = new MockAuth();
  todos = new MockTodos();
  isFirebaseActive = false;
  console.log('Nebula Tasks: Running in Local Demo Mode.');
}

export { auth, todos, isFirebaseActive };
