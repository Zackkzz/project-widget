/** Local HTTPS host for Zoho's widget development mode. No OAuth secrets or application data are served. */
import { createServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { createServer as createViteServer } from 'vite';
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'mpa' });
const [key, cert] = await Promise.all([
  readFile(new URL('../key.pem', import.meta.url)),
  readFile(new URL('../cert.pem', import.meta.url)),
]);
const server = createServer({ key, cert }, (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.url === '/' || req.url === '/app' || req.url === '/app/') {
    res.writeHead(302, { Location: '/widget.html' });
    res.end();
    return;
  }
  if (req.url === '/app/widget.html') req.url = '/widget.html';
  if (req.url === '/plugin-manifest.json') {
    res.setHeader('Content-Type', 'application/json');
    void readFile(new URL('../plugin-manifest.json', import.meta.url)).then((data) =>
      res.end(data),
    );
    return;
  }
  vite.middlewares(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
  });
});
const port = Number(process.env.PORT || 5000);
server.listen(port, '127.0.0.1', () =>
  console.log(`Widget: https://127.0.0.1:${port}/widget.html`),
);
server.on('error', async (error) => {
  console.error(error.message);
  await vite.close();
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close();
    void vite.close().then(() => process.exit(0));
  });
