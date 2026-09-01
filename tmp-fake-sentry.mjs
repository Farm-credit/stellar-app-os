// Temporary — stands in for Sentry's ingest endpoint. Appends each received
// envelope to tmp-sentry-ingest.log. Delete along with the other tmp-* files.
import http from 'node:http';
import { appendFileSync } from 'node:fs';

const LOG = 'tmp-sentry-ingest.log';

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      appendFileSync(LOG, `=== ${req.method} ${req.url}\n${body}\n`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  })
  .listen(9877, '127.0.0.1', () => {
    appendFileSync(LOG, 'fake-sentry listening on 9877\n');
  });
