// worker.js
// Эмулируем window в воркере и загружаем bundle.js с библиотеками
self.window = self;
importScripts('libs/bundle.js');

// Из bundle.js
const BNAll   = window.bn;
const ECClass = window.elliptic.ec;
const hashjs  = window.hash;
const bs58all = window.bs58;
const Buffer  = window.Buffer;

if (!BNAll || !ECClass || !hashjs || !bs58all || !Buffer) {
  postMessage({ type: 'error', error: 'Не загружены библиотеки!' });
  close();
}

const ec = new ECClass('secp256k1');
const BN = BNAll;
// Универсальный поиск функции encode для bs58
let bs58encode;
if (typeof bs58all === 'function') {
  bs58encode = bs58all;
} else if (bs58all.encode) {
  bs58encode = bs58all.encode;
} else if (bs58all.default) {
  bs58encode = (typeof bs58all.default === 'function')
    ? bs58all.default
    : bs58all.default.encode;
}

self.onmessage = e => {
  const { id, start, end, prefix, fullAddress } = e.data;
  let current = new BN(start, 10);
  const max    = new BN(end, 10);
  const startBn= current.clone();
  const batchSize = 500;

  function loop() {
    let checkedCount = 0;
    while (checkedCount < batchSize && current.lte(max)) {
      // Генерация приватного ключа
      const privHex = current.toString(16).padStart(64, '0');
      const keyPair = ec.keyFromPrivate(privHex);
      const P       = keyPair.getPublic();
      const xHex    = P.getX().toString('hex').padStart(64, '0');
      const prefixPc= P.getY().isEven() ? '02' : '03';
      const pubBuf  = Buffer.from(prefixPc + xHex, 'hex');

      // Хеширование и RIPEMD-160
      const sha  = hashjs.sha256().update(pubBuf).digest();
      const rmdBytes = hashjs.ripemd160().update(Buffer.from(sha)).digest();
      const rmd = Buffer.from(rmdBytes);

      // Подготовка payload и контрольной суммы
      const payload = Buffer.concat([Buffer.from([0x00]), rmd]);
      const csumBytes = hashjs.sha256()
        .update(hashjs.sha256().update(payload).digest())
        .digest().slice(0, 4);
      const csum = Buffer.from(csumBytes);

      // Полный буфер для bs58
      const full = Buffer.concat([payload, csum]);
      const address = bs58encode(full);

      // Проверка префикса или полного адреса
      if ((prefix && address.startsWith(prefix)) ||
          (fullAddress && address === fullAddress)) {
        postMessage({ type: 'found', id, key: privHex, address });
      }

      checkedCount++;
      current = current.addn(1);
    }

    // Вычисляем прогресс
    const done  = current.sub(startBn);
    const total = max.sub(startBn);
    const percent = total.isZero()
      ? 100
      : done.muln(100).div(total).toNumber();

    postMessage({ type: 'progress', id, checkedCount, progress: percent });

    if (current.lte(max)) {
      setTimeout(loop, 0);
    } else {
      postMessage({ type: 'done', id });
    }
  }

  loop();
};
