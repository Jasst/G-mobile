const startHexInput = document.getElementById('startHex');
const endHexInput = document.getElementById('endHex');
const prefixInput = document.getElementById('prefix');
const fullAddressInput = document.getElementById('fullAddress');
const workerCountInput = document.getElementById('workerCount');
const toggleBtn = document.getElementById('toggleBtn');
const resetBtn = document.getElementById('resetBtn');
const downloadLogBtn = document.getElementById('downloadLogBtn');
const statusEl = document.getElementById('status');
const counterEl = document.getElementById('counter');
const progressBarsEl = document.getElementById('progressBars');
const logEl = document.getElementById('log');
const modeRangeRadio = document.getElementById('modeRange');
const modeRandomRadio = document.getElementById('modeRandom');

let workers = [];
let isRunning = false;
let totalChecked = 0;
let workerProgress = [];
let progressUpdateThrottle = null;

function createProgressBar(id) {
  const block = document.createElement('div');
  block.className = 'worker-block';
  const title = document.createElement('div');
  title.className = 'worker-title';
  title.textContent = `Воркер #${id + 1}`;
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressFill.style.width = '0%';
  progressFill.id = `progressFill${id}`;
  progressBar.appendChild(progressFill);
  block.appendChild(title);
  block.appendChild(progressBar);
  progressBarsEl.appendChild(block);
}

function updateProgressBars() {
  // throttle обновления прогресс-баров, чтобы не вызывать слишком часто
  if (progressUpdateThrottle) return;
  progressUpdateThrottle = requestAnimationFrame(() => {
    workers.forEach((_, i) => {
      const fill = document.getElementById(`progressFill${i}`);
      if (fill && workerProgress[i] !== undefined && workerProgress[i] !== null) {
        const percent = Math.min(workerProgress[i], 100);
        fill.style.width = `${percent}%`;
      }
    });
    progressUpdateThrottle = null;
  });
}

function appendLog(text, isFound = false) {
  const span = document.createElement('span');
  if (isFound) span.className = 'found';
  span.textContent = text + '\n';
  logEl.appendChild(span);
  // Оптимизация скролла: сработает раз в 100 мс максимум
  if (!appendLog.scrollTimeout) {
    appendLog.scrollTimeout = setTimeout(() => {
      logEl.scrollTop = logEl.scrollHeight;
      appendLog.scrollTimeout = null;
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
}

function disableInputs(disabled) {
  startHexInput.disabled = disabled;
  endHexInput.disabled = disabled;
  prefixInput.disabled = disabled;
  fullAddressInput.disabled = disabled;
  workerCountInput.disabled = disabled;
  modeRangeRadio.disabled = disabled;
  modeRandomRadio.disabled = disabled;
}

function gatherParams() {
  const mode = modeRangeRadio.checked ? 'range' : 'random';
  const workersNum = Math.min(Math.max(parseInt(workerCountInput.value) || 4, 1), 16);

  let startHex = startHexInput.value.trim() || '0';
  let endHex = endHexInput.value.trim() || 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';

  const hexRegexp = /^[0-9a-fA-F]+$/;
  if (mode === 'range' && (!hexRegexp.test(startHex) || !hexRegexp.test(endHex))) {
    alert('Начальный и конечный HEX должны содержать только 0-9, A-F');
    return null;
  }
  if (mode === 'range' && BigInt('0x' + endHex) < BigInt('0x' + startHex)) {
    alert('Конечный HEX должен быть больше или равен начальному');
    return null;
  }

  return {
    mode,
    workersNum,
    start: startHex.toLowerCase(),
    end: endHex.toLowerCase(),
    prefix: prefixInput.value.trim(),
    fullAddress: fullAddressInput.value.trim()
  };
}

function createWorker(id, params) {
  const w = new Worker('worker.js');
  w.onmessage = (e) => {
    const data = e.data;
    switch (data.type) {
      case 'progress':
        workerProgress[data.workerIndex] = data.progress !== null ? data.progress : 0;
        totalChecked += data.checkedCount || 0;
        // Обновляем счетчик и прогресс с throttle
        if (!updateProgressBars.lastUpdate || Date.now() - updateProgressBars.lastUpdate > 50) {
          counterEl.textContent = `Проверено: ${totalChecked.toLocaleString()}`;
          updateProgressBars();
          updateProgressBars.lastUpdate = Date.now();
        }
        break;

      case 'found':
        appendLog(`Найден адрес: ${data.address} | priv: ${data.privKey}`, true);
        break;

      case 'error':
        appendLog(`Ошибка в воркере #${id + 1}: ${data.error}`);
        break;

      case 'done':
        appendLog(`Воркер #${data.workerIndex + 1} завершил работу.`);
        break;
    }
  };

  w.onerror = (err) => {
    appendLog(`Ошибка в воркере #${id + 1}: ${err.message}`);
  };

  w.postMessage({ ...params, id: id, workerIndex: id });

  return w;
}

async function startWorkers() {
  clearUI();

  const params = gatherParams();
  if (!params) return;

  disableInputs(true);
  toggleBtn.textContent = 'Стоп';
  statusEl.textContent = 'Поиск...';

  workers = [];
  workerProgress = new Array(params.workersNum).fill(0);
  totalChecked = 0;

  for (let i = 0; i < params.workersNum; i++) {
    createProgressBar(i);
    workers[i] = createWorker(i, params);
  }

  isRunning = true;
}

function stopWorkers() {
  workers.forEach(w => w.terminate());
  workers = [];
  isRunning = false;
  disableInputs(false);
  toggleBtn.textContent = 'Начать';
  statusEl.textContent = 'Остановлено';
  totalChecked = 0;
}

toggleBtn.addEventListener('click', () => {
  if (!isRunning) {
    startWorkers();
  } else {
    stopWorkers();
  }
});

resetBtn.addEventListener('click', () => {
  if (isRunning) stopWorkers();
  clearUI();
});

downloadLogBtn.addEventListener('click', () => {
  const blob = new Blob([logEl.textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'log.txt';
  a.click();
  URL.revokeObjectURL(url);
});
