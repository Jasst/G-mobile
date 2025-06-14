const startHexInput = document.getElementById('startHex');
const endHexInput = document.getElementById('endHex');
const prefixInput = document.getElementById('prefix');
const fullAddressInput = document.getElementById('fullAddress');
const workerCountInput = document.getElementById('workerCount');
const modeRangeRadio = document.getElementById('modeRange');
const modeRandomRadio = document.getElementById('modeRandom');
const toggleBtn = document.getElementById('toggleBtn');
const resetBtn = document.getElementById('resetBtn');
const downloadLogBtn = document.getElementById('downloadLogBtn');
const statusEl = document.getElementById('status');
const counterEl = document.getElementById('counter');
const progressBarsEl = document.getElementById('progressBars');
const logEl = document.getElementById('log');
const clearSessionBtn = document.getElementById('clearSessionBtn');
const resumeNotice = document.getElementById('resumeNotice');

clearSessionBtn.addEventListener('click', () => {
  localStorage.removeItem('resumeHex');
  resumeHex = null;
  toggleBtn.textContent = 'Начать';
  if (resumeNotice) resumeNotice.style.display = 'none';
  appendLog('🗑 Сохранённая сессия удалена.');
});

let workers = [];
let workerProgress = [];
let totalChecked = 0;
let foundCount = 0;
let doneWorkers = 0;
let isRunning = false;
let startTime = null;
let resumeHex = loadResumeHex(); // Загружаем сохранённую позицию
let appendScrollTimeout = null;

// Автозагрузка сохранённой позиции
function saveResumeHex(hex) {
  if (hex) localStorage.setItem('resumeHex', hex);
  else localStorage.removeItem('resumeHex');
}
function loadResumeHex() {
  return localStorage.getItem('resumeHex');
}

// Форматирование ввода
[startHexInput, endHexInput].forEach(inp => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\s+/g, '').toLowerCase();
  });
});

// UI
function appendLog(text, isFound = false) {
  const span = document.createElement('span');
  if (isFound) span.className = 'found';
  span.textContent = text + '\n';
  logEl.appendChild(span);
  if (!appendScrollTimeout) {
    appendScrollTimeout = setTimeout(() => {
      logEl.scrollTop = logEl.scrollHeight;
      appendScrollTimeout = null;
    }, 100);
  }
}
function clearUI() {
  logEl.textContent = '';
  counterEl.textContent = 'Проверено: 0';
  statusEl.textContent = 'Готов';
  progressBarsEl.textContent = '';
  totalChecked = 0;
  workerProgress = [];
  foundCount = 0;
  doneWorkers = 0;
}
function disableInputs(v) {
  [startHexInput, endHexInput, prefixInput, fullAddressInput, workerCountInput, modeRangeRadio, modeRandomRadio].forEach(el => el.disabled = v);
}
function createProgressBar(id) {
  const block = document.createElement('div');
  block.className = 'worker-block';
  const title = document.createElement('div');
  title.className = 'worker-title';
  title.textContent = `Воркер #${id + 1}`;
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.id = `progressFill${id}`;
  bar.appendChild(fill);
  block.appendChild(title);
  block.appendChild(bar);
  progressBarsEl.appendChild(block);
}
function updateProgressBars() {
  requestAnimationFrame(() => {
    workers.forEach((_, i) => {
      const fill = document.getElementById(`progressFill${i}`);
      const p = workerProgress[i] || 0;
      if (fill) fill.style.width = `${Math.min(p, 100)}%`;
    });
  });
}

// IndexedDB для найденных
const dbPromise = indexedDB.open('btc-finder', 1);
dbPromise.onupgradeneeded = evt => {
  evt.target.result.createObjectStore('found', { keyPath: 'address' });
};
async function saveFound(address, privKey) {
  const db = (await dbPromise).result;
  const tx = db.transaction('found', 'readwrite');
  tx.objectStore('found').put({ address, privKey, time: Date.now() });
}
async function loadSaved() {
  const db = (await dbPromise).result;
  const tx = db.transaction('found', 'readonly');
  const store = tx.objectStore('found');
  const request = store.openCursor();
  return new Promise(resolve => {
    const result = [];
    request.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        result.push(cursor.value);
        cursor.continue();
      } else {
        result.forEach(v => appendLog(`Сохранён: ${v.address} | priv: ${v.privKey}`, true));
        resolve();
      }
    };
  });
}

// Параметры
function gatherParams() {
  const mode = modeRangeRadio.checked ? 'range' : 'random';
  const workersNum = Math.min(Math.max(+workerCountInput.value || 4, 1), 16);
  let start = startHexInput.value.trim() || '0';
  let end = endHexInput.value.trim() || 'f'.repeat(64);
  const hexRE = /^[0-9a-f]+$/;
  if (mode === 'range' && (!hexRE.test(start) || !hexRE.test(end))) {
    alert('HEX ввод некорректен');
    return;
  }
  if (mode === 'range' && BigInt('0x' + end) < BigInt('0x' + start)) {
    alert('end < start');
    return;
  }
  if (resumeHex) start = resumeHex;
  return {
    mode,
    workersNum,
    start,
    end,
    prefix: prefixInput.value.trim(),
    fullAddress: fullAddressInput.value.trim()
  };
}

// Воркеры
function createWorker(id, params) {
  const w = new Worker('worker.js');
  w.onmessage = e => {
    const d = e.data;
    switch (d.type) {
      case 'progress':
        workerProgress[d.workerIndex] = d.progress || 0;
        totalChecked += d.checkedCount || 0;
        counterEl.textContent = `Проверено: ${totalChecked.toLocaleString()}`;
        break;
      case 'found':
        foundCount++;
        appendLog(`Найден адрес #${foundCount}: ${d.address} | priv: ${d.privKey}`, true);
        saveFound(d.address, d.privKey);
        break;
      case 'done':
        doneWorkers++;
        if (d.nextStartHex) resumeHex = d.nextStartHex;
        if (doneWorkers === workers.length) stopWorkers();
        break;
      case 'error':
        appendLog(`Ошибка #${d.workerIndex + 1}: ${d.error}`);
        break;
    }
    updateProgressBars();
  };
  w.onerror = e => appendLog(`Ошибка #${id + 1}: ${e.message}`);
  w.postMessage({ ...params, id, workerIndex: id });
  return w;
}

function startWorkers() {
  clearUI();
  loadSaved();
  const params = gatherParams();
  if (!params) return;
  disableInputs(true);
  toggleBtn.textContent = 'Стоп';
  statusEl.textContent = 'Поиск...';
  workers = [];
  workerProgress = Array(params.workersNum).fill(0);
  totalChecked = foundCount = doneWorkers = 0;
  startTime = Date.now();
  for (let i = 0; i < params.workersNum; i++) {
    createProgressBar(i);
    workers.push(createWorker(i, params));
  }
  isRunning = true;
}

function stopWorkers() {
  workers.forEach(w => w.terminate());
  workers = [];
  isRunning = false;
  disableInputs(false);
  toggleBtn.textContent = resumeHex ? 'Продолжить' : 'Начать';
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  statusEl.textContent = resumeHex ? `Остановлено. Продолжить с ${resumeHex}` : `Остановлено: ${elapsed} сек`;
  saveResumeHex(resumeHex); // Сохраняем
}

// Кнопки
toggleBtn.addEventListener('click', () => {
  isRunning ? stopWorkers() : startWorkers();
});
resetBtn.addEventListener('click', () => {
  if (isRunning) stopWorkers();
  resumeHex = null;
  saveResumeHex(null); // Очистка
  clearUI();
});
downloadLogBtn.addEventListener('click', () => {
  const blob = new Blob([logEl.textContent], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'log.txt';
  a.click();
});
