const {test} = require('@alexbosworth/tap');

const {getChainFeeRate} = require('./../../');
const {delay} = require('./../macros');
const {spawnLnd} = require('./../macros');
const {waitForTermination} = require('./../macros');

// Getting the chain fee rate should return the fee rate estimate
test(`Get chain fee rate`, async ({end, equal}) => {
  const spawned = await spawnLnd({});

  const feeRate = await getChainFeeRate({lnd: spawned.lnd});

  equal(feeRate.tokens_per_vbyte, 50, 'Fee rate is returned');

  spawned.kill();

  await waitForTermination({lnd: spawned.lnd});

  return end();
});
