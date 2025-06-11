// worker.js

importScripts('bitcoinjs-lib.min.js'); // Если нужен bitcoinjs, подключаем

// Вспомогательная функция для инкремента ключа (HEX, 64 символа)
function incrementHex(hex) {
  let num = BigInt('0x' + hex);
  num += 1n;
  let s = num.toString(16);
  return s.padStart(64, '0');
}

// Проверка адреса по префиксу
function checkAddress(privateKeyHex, prefix) {
  try {
    const keyBuffer = Buffer.from(privateKeyHex, 'hex');
    const keyPair = bitcoinjs.ECPair.fromPrivateKey(keyBuffer);
    const { address } = bitcoinjs.payments.p2pkh({ pubkey: keyPair.publicKey });
    return address.startsWith(prefix) ? { address, wif: keyPair.toWIF() } : null;
  } catch (e) {
    return null;
  }
}

let running = false;
let currentKey = null;
let endKey = null;
let prefix = '';
let mode = 'sequential';

// Основной цикл поиска
async function searchLoop() {
  while (running) {
    if (currentKey === null || BigInt('0x' + currentKey) > BigInt('0x' + endKey)) {
      // Завершили работу
      postMessage({ type: 'done', currentKey });
      running = false;
      return;
    }

    // Проверка адреса
    const res = checkAddress(currentKey, prefix);

    // Отправляем прогресс
    postMessage({
      type: 'progress',
      currentKey,
      found: !!res,
      privateKey: res ? currentKey : null,
      address: res ? res.address : null,
      wif: res ? res.wif : null,
    });

    // Следующий ключ
    if (mode === 'sequential') {
      currentKey = incrementHex(currentKey);
    } else if (mode === 'random') {
      // Пример рандомного выбора ключа в диапазоне (упрощенно)
      const startNum = BigInt('0x' + startKey);
      const endNum = BigInt('0x' + endKey);
      const range = endNum - startNum + 1n;
      const randOffset = BigInt(Math.floor(Math.random() * Number(range)));
      currentKey = (startNum + randOffset).toString(16).padStart(64, '0');
    }

    // Чтобы не блокировать полностью event loop, yield каждые 100 итераций
    await new Promise(r => setTimeout(r, 0));
  }
}

let startKey = null;

onmessage = function (e) {
  const data = e.data;
  if (data.cmd === 'start') {
    startKey = data.start;
    currentKey = data.resumeFrom || data.start;
    endKey = data.end;
    prefix = data.prefix || '';
    mode = data.mode || 'sequential';
    running = true;
    searchLoop();
  }
  if (data.cmd === 'stop') {
    running = false;
    postMessage({ type: 'done', currentKey });
  }
};
