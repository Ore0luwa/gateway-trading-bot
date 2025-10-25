const fs = require('fs');
const bs58 = require('bs58');

const keyfile = JSON.parse(fs.readFileSync('bot-wallet.json'));
const privateKey = bs58.encode(Buffer.from(keyfile));
console.log('Private Key (base58):', privateKey);
