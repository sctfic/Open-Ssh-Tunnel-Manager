import test from 'node:test';
import assert from 'node:assert/strict';
import { sliderRate, rateSlider, channelsHtml, cardHtml } from '../frontend/assets/js/tunnels.js';

// Tester les transformations métier sans simuler un navigateur entier : les
// extrémités logarithmiques et le sens -R ne doivent pas dépendre du rendu DOM.
test('bandwidth sliders cover four logarithmic decades', () => {
  for (const rate of [1, 10, 100, 1000, 10000]) assert.equal(sliderRate(rateSlider(rate)), rate);
  assert.equal(sliderRate(0), 1); assert.equal(sliderRate(1000), 10000);
});
test('reverse channels show the local destination before the remote listener', () => {
  const html = channelsHtml({ '-R': { 8000: { name: '<test>', listen_host: 'remote', listen_port: 8000, endpoint_host: 'local', endpoint_port: 80 } } }, { '-R:8000': { tcp: true, icmp: false } });
  assert.ok(html.indexOf('local:80') < html.indexOf('remote:8000'));
  assert.match(html, /←/); assert.match(html, /&lt;test&gt;/);
  assert.match(html, /probe--tcp probe--ok/); assert.doesNotMatch(html, /probe--icmp probe--ok/);
});
test('collapsed cards expose execution and management controls according to rights', () => {
  const tunnel = { id: 'alpha', level: 4, status: 'reconnecting', desired: 'running', config: { bandwidth: { up: 100, down: 1000 }, tunnels: {} } };
  const html = cardHtml(tunnel, false);
  assert.match(html, /data-add-channel/); assert.match(html, /data-rights/);
  assert.match(html, /data-action="stop"\s*>/);
  const reader = cardHtml({ ...tunnel, level: 1 }, false);
  assert.doesNotMatch(reader, /data-action=|data-add-channel|data-delete/);
});
