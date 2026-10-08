import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { boundedBody, boundedJson } from '../lib/body';

test('request stream limit works without Content-Length', async () => {
  const req = new NextRequest('http://localhost/api/documents', { method: 'POST', body: 'x'.repeat(1000) });
  assert.equal(req.headers.get('content-length'), null);
  await assert.rejects(boundedBody(req, 10), /过大/);
});
test('declared oversized requests are rejected before reading', async () => {
  const req = new NextRequest('http://localhost/api/profile', { method: 'POST', headers: { 'Content-Length': '1000' }, body: 'x' });
  await assert.rejects(boundedBody(req, 10), /过大/);
});
test('bounded JSON reads valid user data', async () => {
  const req = new NextRequest('http://localhost/api/profile', { method: 'POST', body: JSON.stringify({ name: '中文姓名' }) });
  assert.deepEqual(await boundedJson(req, 100), { name: '中文姓名' });
});
