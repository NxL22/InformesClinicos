const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readConfig } = require('../src/config/env');

test('rechaza puertos inválidos y opciones SSL ambiguas', () => {
  for (const value of ['0', '-1', '65536', '3000abc', '1.5']) {
    assert.throws(() => readConfig({ PORT: value }), /PORT/);
    assert.throws(() => readConfig({ DB_PORT: value }), /DB_PORT/);
  }
  assert.throws(() => readConfig({ DB_SSL: 'yes' }), /DB_SSL/);
});
