const {test} = require('@alexbosworth/tap');

const {addPeer} = require('./../../');
const {createCluster} = require('./../macros');
const {createInvoice} = require('./../../');
const {delay} = require('./../macros');
const {getForwards} = require('./../../');
const {pay} = require('./../../');
const {setupChannel} = require('./../macros');

const limit = 1;
const tokens = 100;

// Getting forwarded payments should return all forwarded payments
test('Get forwards', async ({end, equal, strictSame}) => {
  const cluster = await createCluster({});

  await setupChannel({
    generate: cluster.generate,
    lnd: cluster.control.lnd,
    to: cluster.target,
  });

  await setupChannel({
    lnd: cluster.target.lnd,
    generate: cluster.generate,
    generator: cluster.target,
    to: cluster.remote,
  });

  await addPeer({
    lnd: cluster.control.lnd,
    public_key: cluster.remote.public_key,
    socket: cluster.remote.socket,
  });

  await delay(2000);

  for (let i = 0, lnd = cluster.remote.lnd; i < 3; i++) {
    await pay({
      lnd: cluster.control.lnd,
      request: (await createInvoice({lnd, tokens: tokens + i})).request,
    });

    await delay(1000);
  }

  const {lnd} = cluster.target;

  const page1 = await getForwards({limit, lnd});

  equal(!!page1.next, true, 'Page 1 leads to page 2');

  {
    const [forward] = page1.forwards;

    equal(!!forward.created_at, true, 'Forward created at');
    equal(forward.fee, 1, 'Forward fee charged');
    equal(forward.fee_mtokens, '1000', 'Forward fee charged');
    equal(!!forward.incoming_channel, true, 'Forward incoming channel');
    equal(forward.tokens, 100, 'Forwarded tokens count');
    equal(!!forward.outgoing_channel, true, 'Forward outgoing channel');
  }

  const page2 = await getForwards({lnd, token: page1.next});

  equal(!!page2.next, true, 'Page 2 leads to page 3');

  {
    const [forward] = page2.forwards;

    equal(forward.tokens, 101, 'Second forward tokens count');
  }

  const page3 = await getForwards({lnd, token: page2.next});

  equal(!!page3.next, true, 'Page 3 leads to page 4');

  {
    const [forward] = page3.forwards;

    equal(forward.tokens, 102, 'Third forward tokens count');

    // Check "before" based paging
    const prev0 = await getForwards({limit, lnd, before: forward.created_at});

    const [firstForward] = prev0.forwards;

    equal(firstForward.tokens, 100, 'Previous row #1');

    const prev1 = await getForwards({lnd, token: prev0.next});

    const [secondForward] = prev1.forwards;

    equal(secondForward.tokens, 101, 'Previous row #2');

    const prev2 = await getForwards({lnd, token: prev1.next});

    equal(prev2.next, undefined, 'Ended paging of previous rows');

    // Check "after" based paging
    const after0 = await getForwards({
      limit,
      lnd,
      before: forward.created_at,
      after: firstForward.created_at,
    });

    strictSame(after0.forwards, prev0.forwards, 'After is inclusive of start');

    const after1 = await getForwards({lnd, token: after0.next});

    strictSame(after1.forwards, prev1.forwards, 'Iterating before, after');

    const after2 = await getForwards({lnd, token: after1.next});

    equal(after2.next, undefined, 'Before is non-inclusive');
  }

  const page4 = await getForwards({lnd, token: page3.next});

  equal(page4.forwards.length, [].length, 'Page 4 has no results');
  equal(page4.next, undefined, 'Page 4 leads to nowhere');

  await cluster.kill({});

  return end();
});
