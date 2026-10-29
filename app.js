const STORAGE_KEY = 'todo-app-items-v1';

const todoForm = document.getElementById('todoForm');
const todoInput = document.getElementById('todoInput');
const todoList = document.getElementById('todoList');
const taskCount = document.getElementById('taskCount');
const emptyState = document.getElementById('emptyState');
const clearCompletedBtn = document.getElementById('clearCompleted');
const filterButtons = document.querySelectorAll('.filter-btn');

let tasks = loadTasks();
let currentFilter = 'all';

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function createTask(text) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    completed: false,
    createdAt: new Date().toISOString(),
  };
}

function updateCount() {
  const remaining = tasks.filter((task) => !task.completed).length;
  taskCount.textContent = `${remaining} task${remaining === 1 ? '' : 's'}`;
}

function getFilteredTasks() {
  if (currentFilter === 'active') {
    return tasks.filter((task) => !task.completed);
  }

  if (currentFilter === 'completed') {
    return tasks.filter((task) => task.completed);
  }

  return tasks;
}

function render() {
  const visibleTasks = getFilteredTasks();
  todoList.innerHTML = '';

  if (visibleTasks.length === 0) {
    emptyState.classList.add('visible');
  } else {
    emptyState.classList.remove('visible');
  }

  visibleTasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = `todo-item${task.completed ? ' completed' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.className = 'todo-check';
    checkbox.setAttribute('aria-label', `Mark ${task.text} as complete`);
    checkbox.addEventListener('change', () => toggleTask(task.id));

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = task.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('aria-label', `Delete ${task.text}`);
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    item.append(checkbox, text, deleteBtn);
    todoList.appendChild(item);
  });

  updateCount();
}

function addTask(text) {
  const value = text.trim();
  if (!value) return;

  tasks.unshift(createTask(value));
  saveTasks();
  render();
}

function toggleTask(id) {
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  render();
}

function clearCompleted() {
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  render();
}

function setFilter(filter) {
  currentFilter = filter;
  filterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
  render();
}

todoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = todoInput.value;
  addTask(value);
  todoInput.value = '';
  todoInput.focus();
});

clearCompletedBtn.addEventListener('click', clearCompleted);

filterButtons.forEach((button) => {
  button.addEventListener('click', () => setFilter(button.dataset.filter));
});

render();
