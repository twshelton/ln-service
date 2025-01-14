const {test} = require('@alexbosworth/tap');

const {createCluster} = require('./../macros');
const {createInvoice} = require('./../../');
const {deletePayments} = require('./../../');
const {getPayments} = require('./../../');
const {pay} = require('./../../');
const {setupChannel} = require('./../macros');

const tokens = 100;

// Deleting payments should delete all payments
test('Delete payments', async ({afterEach, fail, end, equal}) => {
  const cluster = await createCluster({is_remote_skipped: true});

  const {lnd} = cluster.control;

  await setupChannel({lnd, generate: cluster.generate, to: cluster.target});

  const invoice = await createInvoice({tokens, lnd: cluster.target.lnd});

  let paid;

  try {
    paid = await pay({lnd, request: invoice.request});
  } catch (err) {
    fail('Payment should be made to destination');

    await cluster.kill({});

    return end();
  }

  const priorLength = (await getPayments({lnd})).payments.length;

  await deletePayments({lnd});

  const wipedLength = (await getPayments({lnd})).payments.length;

  equal(priorLength - wipedLength, [paid].length, 'Payment history deleted');

  await cluster.kill({});

  return end();
});
