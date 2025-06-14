// main.js
document.addEventListener('DOMContentLoaded', () => {
  const startHex = document.getElementById('startHex');
  const endHex = document.getElementById('endHex');
  const prefix = document.getElementById('prefix');
  const fullAddr = document.getElementById('fullAddress');
  const wCount = document.getElementById('workerCount');
  const btnToggle = document.getElementById('toggleBtn');
  const btnReset = document.getElementById('resetBtn');
  const btnDL = document.getElementById('downloadLogBtn');
  const statusEl = document.getElementById('status');
  const counterEl = document.getElementById('counter');
  const barsEl = document.getElementById('progressBars');
  const logEl = document.getElementById('log');

  let workers = [];
  let running = false;
  let checked = 0;
  let totalWorkers = 4;
  let doneFlags = [];

  function updateFill(text, isFound = false) {
    const el = document.createElement('div');
    el.textContent = text;
    if (isFound) el.classList.add('found');
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function createBars(n) {
    barsEl.innerHTML = '';
    doneFlags = Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      const block = document.createElement('div');
      block.className = 'worker-block';
      block.innerHTML = `
        <div class="worker-title">Worker ${i}</div>
        <div class="progress-bar"><div id="fill_${i}" class="progress-fill"></div></div>
      `;
      barsEl.appendChild(block);
    }
  }

  function resetAll() {
    workers.forEach(w => w.terminate());
    workers = []; running = false; checked = 0;
    counterEl.textContent = 'Проверено: 0';
    statusEl.textContent = 'Готов';
    barsEl.innerHTML = '';
    logEl.innerHTML = '';
    btnToggle.textContent = 'Начать';
  }

  function updateBar(id, percent) {
    const fill = document.getElementById(`fill_${id}`);
    if (fill) fill.style.width = percent + '%';
  }

  function startSearch() {
    if (running) return;
    if (!/^[0-9A-Fa-f]{1,64}$/.test(startHex.value) || !/^[0-9A-Fa-f]{1,64}$/.test(endHex.value)) {
      alert('HEX должен быть 1–64 символов 0–9, A–F');
      return;
    }
    if (!prefix.value && !fullAddr.value) {
      alert('Укажи префикс или полный адрес');
      return;
    }

    totalWorkers = Math.min(Math.max(+wCount.value || 1, 1), 16);
    resetAll();
    createBars(totalWorkers);

    const bStart = BigInt('0x' + startHex.value.padStart(64, '0'));
    const bEnd = BigInt('0x' + endHex.value.padStart(64, '0'));
    const range = bEnd - bStart + 1n;
    const size = range / BigInt(totalWorkers);

    running = true;
    statusEl.textContent = 'Поиск...';
    btnToggle.textContent = 'Пауза';

    workers = [];
    for (let i = 0; i < totalWorkers; i++) {
      const worker = new Worker('worker.js');
      const start = (bStart + size * BigInt(i)).toString();
      const end = (i === totalWorkers - 1)
        ? bEnd.toString()
        : (BigInt(start) + size - 1n).toString();

      worker.postMessage({ id: i, start, end, prefix: prefix.value, fullAddress: fullAddr.value });
      worker.onmessage = e => {
        const msg = e.data;
        if (msg.type === 'progress') {
          checked += msg.checkedCount;
          counterEl.textContent = `Проверено: ${checked}`;
          updateBar(msg.id, msg.progress);
        } else if (msg.type === 'found') {
          updateFill(`Worker ${msg.id}: найден ключ ${msg.key}, адрес ${msg.address}`, true);
        } else if (msg.type === 'done') {
          doneFlags[msg.id] = true;
          updateFill(`Worker ${msg.id} завершил`);
          if (doneFlags.every(f => f)) {
            running = false;
            statusEl.textContent = 'Готов';
            btnToggle.textContent = 'Начать';
          }
        }
      };
      workers.push(worker);
    }
  }

  btnToggle.addEventListener('click', () => running ? resetAll() : startSearch());
  btnReset.addEventListener('click', resetAll);
  btnDL.addEventListener('click', () => {
    const blob = new Blob([logEl.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'log.txt';
    a.click();
    URL.revokeObjectURL(url);
  });
});
