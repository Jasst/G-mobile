// worker.js
importScripts('bitcoinjs-lib.min.js');

let running = false;
let startKey, endKey;
let prefix = '';
let matchLength = 0;
let mode = 'sequential';
let checkedCount = 0;
let logBuffer = [];
let saveInterval = 10000; // Save every 10,000 keys

function hexToBigInt(hex) {
  return BigInt('0x' + hex);
}

function bigIntToHex(bigint) {
  return bigint.toString(16).padStart(64, '0');
}

function generateWIF(privKeyBuffer) {
  const keyPair = bitcoin.ECPair.fromPrivateKey(privKeyBuffer);
  return keyPair.toWIF();
}

function generateAddressFromPriv(privHex) {
  try {
    const keyPair = bitcoin.ECPair.fromPrivateKey(Buffer.from(privHex, 'hex'));
    const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey });
    return { address, wif: keyPair.toWIF() };
  } catch {
    return null;
  }
}

function saveLog() {
  if (logBuffer.length === 0) return;
  postMessage({ type: 'saveLog', data: logBuffer.join('\n') });
  logBuffer = [];
}

onmessage = function (e) {
  const msg = e.data;
  if (msg.cmd === 'start') {
    if (running) return;
    startKey = hexToBigInt(msg.start);
    endKey = hexToBigInt(msg.end);
    prefix = msg.prefix || '';
    matchLength = parseInt(msg.matchLength || '0');
    mode = msg.mode;
    checkedCount = 0;
    running = true;
    search();
  } else if (msg.cmd === 'stop') {
    running = false;
  }
};

async function search() {
  let current = startKey;
  while (running && current <= endKey) {
    const privHex = bigIntToHex(current);
    const result = generateAddressFromPriv(privHex);

    if (result) {
      const { address, wif } = result;
      const matchPrefix = prefix ? address.startsWith(prefix) : true;
      const matchExact = matchLength ? address.substring(0, matchLength) === prefix : true;

      if (matchPrefix && matchExact) {
        const found = `FOUND:\n Address: ${address}\n WIF: ${wif}\n HEX: ${privHex}\n------------`;
        logBuffer.push(found);
        postMessage({
          type: 'progress',
          data: {
            status: 'FOUND!',
            checked: 1,
            found: true,
            address,
            privateKey: privHex,
            wif
          }
        });
      }
    }

    checkedCount++;
    if (checkedCount % 1000 === 0) {
      postMessage({
        type: 'progress',
        data: {
          status: `Checked ${checkedCount} keys...`,
          checked: 1000,
          found: false
        }
      });
    }
    if (checkedCount % saveInterval === 0) {
      saveLog();
    }

    if (mode === 'sequential') {
      current++;
    } else if (mode === 'random') {
      current = startKey + BigInt(Math.floor(Math.random() * Number(endKey - startKey + 1n)));
    }
  }
  saveLog();
  running = false;
  postMessage({ type: 'done', totalChecked: checkedCount });
}
