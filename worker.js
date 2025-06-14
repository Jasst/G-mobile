self.window = self;
importScripts('libs/bundle.js');

function sendError(msg) {
  postMessage({ type: 'error', error: msg });
  close();
}

const BN = self.bn || sendError('BN missing');
const EC = self.elliptic?.ec || sendError('elliptic missing');
const hashjs = self.hash || sendError('hashjs missing');
const Buffer = self.Buffer || sendError('Buffer missing');

let bs58;
try {
  if (typeof self.bs58 === 'function') {
    bs58 = self.bs58;
  } else if (typeof self.bs58?.encode === 'function') {
    bs58 = self.bs58.encode;
  } else if (typeof self.bs58?.default === 'function') {
    bs58 = self.bs58.default;
  } else if (typeof self.bs58?.default?.encode === 'function') {
    bs58 = self.bs58.default.encode;
  } else {
    sendError('bs58.encode not found');
  }
} catch (e) {
  sendError('bs58 processing error: ' + e.message);
}

const ec = new EC('secp256k1');
const pad64 = h => h.padStart(64, '0');

function randomBNInRange(min, max) {
  const range = max.sub(min).addn(1);
  const bytes = range.byteLength();
  const arr = new Uint8Array(bytes);
  let rand;
  do {
    crypto.getRandomValues(arr);
    rand = new BN(arr);
  } while (rand.gte(range));
  return min.add(rand);
}

self.onmessage = e => {
  try {
    const { id, start, end, prefix, fullAddress, mode, workerIndex } = e.data;
    const startBN = new BN(start, 16);
    const endBN = new BN(end, 16);

    const batchSize = 500;
    let current = mode === 'random' ? null : startBN.clone();
    const max = endBN;
    const maxI = mode === 'random' ? 1e6 : null;
    let iter = 0;

    function loop() {
      let cnt = 0;
      while (cnt < batchSize && (mode === 'random' || current.lte(max))) {
        if (mode === 'random' && ++iter > maxI) {
          postMessage({ type: 'done', id, workerIndex, nextStartHex: current?.toString(16) });
          close();
          return;
        }

        const priv = mode === 'random' ? randomBNInRange(startBN, max) : current.clone();
        const privHex = pad64(priv.toString(16));

        const keyPair = ec.keyFromPrivate(privHex);
        const P = keyPair.getPublic();
        const xHex = pad64(P.getX().toString('hex'));
        const prefixPc = P.getY().isEven() ? '02' : '03';
        const pubBuf = Buffer.from(prefixPc + xHex, 'hex');

        const sha = hashjs.sha256().update(pubBuf).digest();
        const rmd = Buffer.from(hashjs.ripemd160().update(Buffer.from(sha)).digest());

        const payload = Buffer.concat([Buffer.from([0x00]), rmd]);
        const csum = Buffer.from(hashjs.sha256().update(hashjs.sha256().update(payload).digest()).digest().slice(0, 4));
        const address = bs58(Buffer.concat([payload, csum]));

        if (fullAddress ? address === fullAddress : prefix ? address.startsWith(prefix) : true) {
          postMessage({ type: 'found', id, privKey: privHex, address });
        }

        cnt++;
        if (mode !== 'random') current = current.addn(1);
      }

      const progress = mode === 'random' ? null : current.sub(startBN).muln(100).div(max.sub(startBN) || new BN(1)).toNumber();
      postMessage({ type: 'progress', id, checkedCount: cnt, progress, workerIndex });

      if (mode === 'random' || current.lte(max)) {
        setTimeout(loop, 0);
      } else {
        postMessage({ type: 'done', id, workerIndex, nextStartHex: current.toString(16) });
        close();
      }
    }

    loop();

  } catch (err) {
    sendError('Exception: ' + err.message);
  }
};
