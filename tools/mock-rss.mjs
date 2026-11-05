// Step 4b: mock RSS sources for the headline feed.
//   /a.xml  RSS 2.0, 5 items
//   /b.xml  Atom, 5 items
import http from 'node:http';

const items = (n, base) => Array.from({ length: n }, (_, i) => ({
  title: base.title + (i + 1),
  link: base.link + (i + 1),
  pubDate: new Date(Date.now() - i * 3600000).toUTCString(),
  guid: base.guid + (i + 1),
}));
const atomItems = (n, base) => Array.from({ length: n }, (_, i) => ({
  title: base.title + (i + 1),
  href: base.link + (i + 1),
  updated: new Date(Date.now() - i * 3600000).toISOString(),
  id: base.guid + (i + 1),
}));

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Mock A</title><link>http://127.0.0.1:9200/a</link><description>mock</description>
${items(5, { title: 'Mock RSS headline ', link: 'http://127.0.0.1:9200/a/', guid: 'urn:mock-a:' })
  .map((it) => `  <item><title>${it.title}</title><link>${it.link}</link><pubDate>${it.pubDate}</pubDate><guid>${it.guid}</guid></item>`).join('\n')}
</channel></rss>`;

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Mock B</title><link rel="self" href="http://127.0.0.1:9200/b.xml"/>
${atomItems(5, { title: 'Mock Atom headline ', link: 'http://127.0.0.1:9200/b/', guid: 'urn:mock-b:' })
  .map((it) => `  <entry><title>${it.title}</title><link href="${it.href}"/><updated>${it.updated}</updated><id>${it.id}</id></entry>`).join('\n')}
</feed>`;

http.createServer((req, res) => {
  if (req.url === '/a.xml') {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml', 'ETag': '"mock-a-1"' });
    return res.end(rss);
  }
  if (req.url === '/b.xml') {
    res.writeHead(200, { 'Content-Type': 'application/atom+xml', 'ETag': '"mock-b-1"' });
    return res.end(atom);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}).listen(9200, '127.0.0.1', () => console.log('mock-rss listening on http://127.0.0.1:9200 (/a.xml rss, /b.xml atom)'));
