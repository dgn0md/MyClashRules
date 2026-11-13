'use strict';
// Local HTTP CONNECT probes against real MRS data. All sockets terminate on loopback.
const net = require('node:net');
const assert = require('node:assert/strict');
const { once } = require('node:events');
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function fixtures() {
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    return socket;
  };
  const sink = net.createServer((s) => {
    track(s);
  });
  const sinkPort = await listen(sink);
  const socks = net.createServer((socket) => {
    track(socket);
    let buffer = Buffer.alloc(0),
      stage = 0;
    socket.on('data', function parse(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 0) {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
        buffer = buffer.subarray(2 + buffer[1]);
        socket.write(Buffer.from([5, 0]));
        stage = 1;
      }
      if (stage === 1) {
        if (buffer.length < 5) return;
        const end = buffer[3] === 1 ? 10 : buffer[3] === 4 ? 22 : 7 + buffer[4];
        if (buffer.length < end) return;
        // Deliberately ignore requested destination: no external packets can leave this fixture.
        const rest = buffer.subarray(end);
        buffer = Buffer.alloc(0);
        stage = 2;
        socket.removeListener('data', parse);
        const target = track(
          net.connect(sinkPort, '127.0.0.1', () => {
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            if (rest.length) target.write(rest);
            socket.pipe(target);
            target.pipe(socket);
          }),
        );
      }
    });
  });
  const socksPort = await listen(socks);
  return {
    sinkPort,
    socksPort,
    track,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise((r) => sink.close(r)), new Promise((r) => socks.close(r))]);
    },
  };
}
const CASES = [
  ['apple-relay.apple.com', 'Apple智能'],
  ['apple-relay.cloudflare.com', 'Apple智能'],
  ['cp4.cloudflare.com', 'Apple智能'],
  ['guzzoni.apple.com', 'Siri'],
  ['api.smoot.apple.com', 'Siri'],
  ['news-client-search.apple.com', 'AppleNews'],
  ['news-assets.apple.com', 'AppleNews'],
  ['apple.news', 'AppleNews'],
  ['gspe1-ssl.ls.apple.com', 'Apple地区检测'],
  ['tv.apple.com', 'AppleTV'],
  ['play-edge.itunes.apple.com', 'AppleTV'],
  ['fitness.apple.com', 'AppleFitness'],
  ['sports.apple.com', 'AppleSports'],
  ['books.apple.com', 'AppleBooks'],
  ['assets.cdn-apple.com', '直连'],
  ['mesu.apple.com', '直连'],
  ['swcdn.apple.com', '直连'],
  ['apps.apple.com', '直连'],
  ['music.apple.com', '直连'],
  ['www.microsoft.com', '直连'],
  ['youtube.com', 'YouTube'],
  ['github.com', 'GitHub'],
  ['store.steampowered.com', 'Steam'],
  ['qq.com', '直连'],
  ['www.baidu.com', '直连'],
];
async function verifyRouting({ port, sinkPort, track, api }) {
  const evidence = [];
  for (const [host, expected] of CASES) {
    const socket = track(net.connect(port, '127.0.0.1'));
    await once(socket, 'connect');
    socket.write(`CONNECT ${host}:${sinkPort} HTTP/1.1\r\nHost: ${host}:${sinkPort}\r\n\r\n`);
    const response = await Promise.race([
      once(socket, 'data'),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`CONNECT timeout: ${host}`)), 3000)),
    ]);
    assert.match(response[0].toString(), /200/);
    socket.write('myclash-routing-probe');
    let connection;
    let active;
    for (let attempt = 0; attempt < 20; attempt++) {
      active = (await api('/connections')).connections || [];
      connection = active.find((c) => c.metadata.host === host);
      if (connection) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(connection, `No active connection for ${host}: ${JSON.stringify(active)}`);
    assert.ok(
      connection.chains.includes(expected),
      `${host}: expected ${expected}; actual ${JSON.stringify(connection)}`,
    );
    evidence.push({
      host,
      expected,
      rule: connection.rule,
      payload: connection.rulePayload,
      chains: connection.chains,
    });
    socket.destroy();
  }
  return evidence;
}
module.exports = { fixtures, verifyRouting, CASES };
