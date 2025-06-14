// worker.js

self.window = self;

importScripts('libs/bundle.js'); // Здесь твоя сборка с bn.js, elliptic, hash.js, bs58 и Buffer

const BNAll   = self.bn;
const ECClass = self.elliptic?.ec;
const hashjs  = self.hash;
const bs58all = self.bs58;
const Buffer  = self.Buffer;

function sendError(msg) {
  postMessage({ type: 'error', error: msg });
  close();
}

if (!BNAll) { sendError('Не загружена библиотека BN!'); }
if (!ECClass) { sendError('Не загружена библиотека elliptic!'); }
if (!hashjs) { sendError('Не загружена библиотека hashjs!'); }
if (!bs58all) { sendError('Не загружена библиотека bs58!'); }
if (!Buffer) { sendError('Не загружена библиотека Buffer!'); }

const ec = new ECClass('secp256k1');
const BN = BNAll;

let bs58encode = null;
if (typeof bs58all === 'function') {
  bs58encode = bs58all;
} else if (bs58all.encode) {
  bs58encode = bs58all.encode;
} else if (bs58all.default) {
  bs58encode = (typeof bs58all.default === 'function') ? bs58all.default : bs58all.default.encode;
}

if (!bs58encode) {
  sendError('Не удалось определить функцию bs58encode');
}

function randomBNInRange(min, max) {
  const range = max.sub(min).addn(1);
  const bytes = range.byteLength();
  let rand;
  do {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    rand = new BN(arr);
  } while (rand.gte(range));
  return min.add(rand);
}

function isValidAddress(address, prefix, fullAddress) {
  if (fullAddress) return address === fullAddress;
  if (prefix) return address.startsWith(prefix);
  return true;
}

self.onmessage = e => {
  try {
    const { id, start, end, prefix, fullAddress, mode = 'range', workerIndex } = e.data;

    const startBN = new BN(start, 16);
    const endBN = new BN(end, 16);

    if (startBN.gt(endBN)) {
      sendError('start должен быть меньше или равен end');
      return;
    }

    const batchSize = 500;
    let current = mode === 'random' ? null : startBN.clone();
    const max = endBN;

    function loop() {
      let checkedCount = 0;

      while (checkedCount < batchSize && (mode === 'random' || current.lte(max))) {
        const priv = mode === 'random' ? randomBNInRange(startBN, max) : current.clone();
        const privHex = priv.toString(16).padStart(64, '0');

        const keyPair = ec.keyFromPrivate(privHex);
        const P = keyPair.getPublic();
        const xHex = P.getX().toString('hex').padStart(64, '0');
        const prefixPc = P.getY().isEven() ? '02' : '03';
        const pubBuf = Buffer.from(prefixPc + xHex, 'hex');

        const sha = hashjs.sha256().update(pubBuf).digest();
        const rmdBytes = hashjs.ripemd160().update(Buffer.from(sha)).digest();
        const rmd = Buffer.from(rmdBytes);

        const payload = Buffer.concat([Buffer.from([0x00]), rmd]);
        const csumBytes = hashjs.sha256()
          .update(hashjs.sha256().update(payload).digest())
          .digest()
          .slice(0, 4);
        const csum = Buffer.from(csumBytes);

        const full = Buffer.concat([payload, csum]);
        const address = bs58encode(full);

        if (isValidAddress(address, prefix, fullAddress)) {
          postMessage({ type: 'found', id, privKey: privHex, address });
        }

        checkedCount++;
        if (mode !== 'random') current = current.addn(1);
      }

      const progress = mode === 'random' ? null : (() => {
        const done = current.sub(startBN);
        const total = max.sub(startBN);
        return total.isZero() ? 100 : done.muln(100).div(total).toNumber();
      })();

      postMessage({ type: 'progress', id, checkedCount, progress, workerIndex });

      if (mode === 'random' || current.lte(max)) {
        setTimeout(loop, 0);
      } else {
        postMessage({ type: 'done', id, workerIndex });
        close();
      }
    }

    loop();

  } catch (err) {
    sendError('Исключение: ' + err.message);
  }
};
