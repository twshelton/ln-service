const {createHash} = require('crypto');
const {randomBytes} = require('crypto');

const asyncRetry = require('async/retry');
const {test} = require('tap');

const {createCluster} = require('./../macros');
const {createHodlInvoice} = require('./../../');
const {delay} = require('./../macros');
const {getInvoice} = require('./../../');
const {getInvoices} = require('./../../');
const {openChannel} = require('./../../');
const {payViaPaymentRequest} = require('./../../');
const {settleHodlInvoice} = require('./../../');
const {subscribeToInvoice} = require('./../../');
const {waitForChannel} = require('./../macros');
const {waitForPendingChannel} = require('./../macros');

const channelCapacityTokens = 1e6;
const confirmationCount = 6;
const defaultFee = 1e3;
const defaultVout = 0;
const interval = retryCount => 50 * Math.pow(2, retryCount);
const times = 15;
const tlvType = '67890';
const tlvValue = '00';
const tokens = 100;

// Subscribe to a settled invoice should return invoice settled event
test(`Subscribe to settled invoice`, async ({deepIs, end, equal}) => {
  const cluster = await createCluster({});
  let currentInvoice;

  const {lnd} = cluster.control;

  const controlToTargetChannel = await openChannel({
    lnd,
    chain_fee_tokens_per_vbyte: defaultFee,
    local_tokens: channelCapacityTokens,
    partner_public_key: cluster.target.public_key,
    socket: cluster.target.socket,
  });

  await waitForPendingChannel({
    lnd,
    id: controlToTargetChannel.transaction_id,
  });

  await cluster.generate({count: confirmationCount, node: cluster.control});

  await waitForChannel({
    lnd,
    id: controlToTargetChannel.transaction_id,
  });

  const secret = randomBytes(32);

  const sub = subscribeToInvoice({
    id: createHash('sha256').update(secret).digest('hex'),
    lnd: cluster.target.lnd,
  });

  sub.on('invoice_updated', data => currentInvoice = data);

  const invoice = await createHodlInvoice({
    tokens,
    id: createHash('sha256').update(secret).digest('hex'),
    lnd: cluster.target.lnd,
  });

  await delay(1000);

  equal(!!currentInvoice.is_held, false, 'Invoice is not held yet');
  equal(!!currentInvoice.is_canceled, false, 'Invoice is not canceled');
  equal(!!currentInvoice.is_confirmed, false, 'Invoice is not confirmed yet');

  setTimeout(async () => {
    // Wait for the invoice to be held
    await asyncRetry({interval, times}, async () => {
      if (!currentInvoice.is_held) {
        throw new Error('ExpectedInvoiceHeld');
      }

      return;
    });

    equal(!!currentInvoice.is_held, true, 'Invoice is not held yet');
    equal(!!currentInvoice.is_canceled, false, 'Invoice is not canceled yet');
    equal(!!currentInvoice.is_confirmed, false, 'Invoice is confirmed');

    await settleHodlInvoice({
      lnd: cluster.target.lnd,
      secret: secret.toString('hex'),
    });

    // Wait for the invoice to be confirmed
    await asyncRetry({interval, times}, async () => {
      if (!currentInvoice.is_confirmed) {
        throw new Error('ExpectedInvoiceConfirmed');
      }

      return;
    });

    const {payments} = currentInvoice;

    if (!!payments.length) {
      const [payment] = payments;

      if (!!payment.messages.length) {
        const [{type, value}] = payment.messages;

        equal(type, tlvType, 'Payment message TLV type returned');
        equal(value, tlvValue, 'Payment message TLV value returned');
      }
    }

    equal(!!currentInvoice.is_held, false, 'Invoice is not held yet');
    equal(!!currentInvoice.is_canceled, false, 'Invoice is not canceled yet');
    equal(!!currentInvoice.is_confirmed, true, 'Invoice is confirmed');

    return setTimeout(async () => {
      await cluster.kill({});
    },
    1000);
  },
  1000);

  const paid = await payViaPaymentRequest({
    lnd,
    messages: [{type: tlvType, value: tlvValue}],
    request: invoice.request,
  });

  equal(paid.secret, secret.toString('hex'), 'Paying reveals the HTLC secret');

  await delay(5000);

  return end();
});
