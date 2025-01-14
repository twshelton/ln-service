const {test} = require('@alexbosworth/tap');

const {getPublicKey} = require('./../../');
const {getWalletInfo} = require('./../../');
const {delay} = require('./../macros');
const {spawnLnd} = require('./../macros');
const {waitForTermination} = require('./../macros');

const identityKeyFamily = 6;

// Getting a public key out of the seed should return the raw public key
test(`Get public key`, async ({end, equal}) => {
  const spawned = await spawnLnd({});

  delay(2000);

  const key = await getPublicKey({
    family: identityKeyFamily,
    index: [].length,
    lnd: spawned.lnd,
  });

  delay(2000);

  const wallet = await getWalletInfo({lnd: spawned.lnd});

  equal(wallet.public_key, key.public_key, 'Derive identity public key');

  spawned.kill();

  await waitForTermination({lnd: spawned.lnd});

  return end();
});
