importScripts('bitcoinjs-lib.min.js');

let running = false;
let startKey, endKey;
let prefix;
let mode;
let checkedCount = 0;

function hexToBigInt(hex) {
    return BigInt('0x' + hex);
}

function bigIntToHex(bigint) {
    return bigint.toString(16).padStart(64, '0');
}

function generateAddressFromPriv(privHex) {
    try {
        const keyPair = bitcoin.ECPair.fromPrivateKey(Buffer.from(privHex, 'hex'));
        const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey });
        return address;
    } catch {
        return null;
    }
}

onmessage = function (e) {
    if (e.data.cmd === 'start') {
        if (running) return;
        startKey = hexToBigInt(e.data.start);
        endKey = hexToBigInt(e.data.end);
        prefix = e.data.prefix;
        mode = e.data.mode;
        checkedCount = 0;
        running = true;
        search();
    } else if (e.data.cmd === 'stop') {
        running = false;
    }
};

async function search() {
    let current = startKey;
    while (running && current <= endKey) {
        const privHex = bigIntToHex(current);
        const addr = generateAddressFromPriv(privHex);

        if (addr && addr.startsWith(prefix)) {
            postMessage({ type: 'found', privKey: privHex, address: addr });
        }

        checkedCount++;
        if (checkedCount % 1000 === 0) {
            postMessage({ type: 'progress', checked: checkedCount, current: privHex });
            await new Promise(r => setTimeout(r, 0)); // Yield thread
        }

        if (mode === 'sequential') {
            current++;
        } else if (mode === 'random') {
            // Для простоты рандом — в пределах start и end
            current = startKey + BigInt(Math.floor(Math.random() * Number(endKey - startKey + 1n)));
        }
    }
    running = false;
    postMessage({ type: 'done', totalChecked: checkedCount });
}