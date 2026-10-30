/**
 * =============================================================================
 * YELIYURU VILLAGE PORTAL - BACKEND SERVER & DATABASE API
 * Built with Node.js & SQLite (node:sqlite)
 * Serves website + REST API on http://localhost:8000
 * =============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');
const db = require('./db');

const PORT = process.env.PORT || 8000;
const PUBLIC_DIR = __dirname;

function publishToGit() {
  return new Promise((resolve) => {
    const cmd = 'git add data.js data.json index.html admin.html admin.js app.js styles.css && git commit -m "feat(data): live sync village portal data from admin" && git push origin main';
    exec(cmd, { cwd: PUBLIC_DIR }, (err, stdout, stderr) => {
      if (err) {
        if ((stdout && stdout.includes('nothing to commit')) || (stderr && stderr.includes('nothing to commit'))) {
          exec('git push origin main', { cwd: PUBLIC_DIR }, (pErr, pStdout, pStderr) => {
            if (pErr) {
              resolve({ pushed: false, message: 'Push failed: ' + (pStderr || pErr.message) });
            } else {
              resolve({ pushed: true, message: 'Working tree was clean; pushed origin main successfully.' });
            }
          });
        } else {
          console.warn('[Git Sync] Auto-push notice:', err.message);
          resolve({ pushed: false, error: err.message });
        }
      } else {
        console.log('[Git Sync] Auto-push succeeded:\n', stdout);
        resolve({ pushed: true, output: stdout });
      }
    });
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        if (!body.trim()) return resolve({});
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // ===========================================================================
  // REST API ROUTER
  // ===========================================================================

  // 1. Health & Database Status
  if (pathname === '/api/status' && method === 'GET') {
    try {
      const stats = db.getDatabaseStats();
      return sendJson(res, 200, {
        status: 'online',
        timestamp: new Date().toISOString(),
        database: stats
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 2. GET Active Village Data (Hydration for frontend)
  if (pathname === '/api/data' && method === 'GET') {
    try {
      const data = db.getActiveVillageData();
      return sendJson(res, 200, { success: true, data });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 3. POST / Update Village Data (From Admin Panel)
  if (pathname === '/api/data' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const pushToGit = body && body.pushToGit;
      if (body && typeof body.pushToGit !== 'undefined') {
        delete body.pushToGit;
      }
      const result = db.updateVillageData(body);
      
      let gitResult = null;
      if (pushToGit) {
        gitResult = await publishToGit();
      }

      return sendJson(res, 200, {
        success: true,
        message: 'Village data saved to SQLite database and data.js successfully.',
        result,
        git: gitResult
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // 3b. POST / Publish Live to GitHub Pages & Mobile
  if (pathname === '/api/publish' && method === 'POST') {
    try {
      const gitResult = await publishToGit();
      return sendJson(res, 200, {
        success: true,
        message: 'Village portal updates published to GitHub Pages for mobile access.',
        git: gitResult
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 4. GET Citizen Messages (For Admin Panel)
  if (pathname === '/api/messages' && method === 'GET') {
    try {
      const messages = db.getMessages();
      return sendJson(res, 200, { success: true, count: messages.length, messages });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 5. POST Citizen Message (From Contact Form)
  if ((pathname === '/api/contact' || pathname === '/api/messages') && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.name || !body.contact || !body.message) {
        return sendJson(res, 400, { error: 'Name, contact, and message are required.' });
      }
      const result = db.saveMessage(body);
      return sendJson(res, 201, {
        success: true,
        message: 'Message saved to database successfully',
        id: result.id
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 6. Mark Message As Read
  if (pathname.startsWith('/api/messages/') && pathname.endsWith('/read') && method === 'POST') {
    try {
      const parts = pathname.split('/');
      const id = parts[3];
      db.markMessageRead(id);
      return sendJson(res, 200, { success: true });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 7. Reset Data to data.js defaults
  if (pathname === '/api/reset-data' && method === 'POST') {
    try {
      const defaultData = db.loadDefaultDataFromDisk();
      db.updateVillageData(defaultData);
      return sendJson(res, 200, { success: true, message: 'Database reset to default data.js dataset' });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ===========================================================================
  // STATIC FILE SERVER
  // ===========================================================================
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure path stays within project folder
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 handler
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Not Found | Yeliyuru Portal</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 4rem;">
          <h1>404 - Page Not Found</h1>
          <p>Requested path: <code>${pathname}</code></p>
          <a href="/" style="color: #059669; font-weight: bold;">← Return to Yeliyuru Portal</a>
        </body>
        </html>
      `);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const noCacheExts = ['.js', '.css', '.json', '.html'];
    const cacheHeader = noCacheExts.includes(ext)
      ? 'no-cache, no-store, must-revalidate, max-age=0'
      : 'public, max-age=3600';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': cacheHeader,
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`[OK] Yeliyuru Village Portal Server & Database Ready!`);
  console.log(`[Web] Public Website:  http://localhost:${PORT}`);
  console.log(`[Admin] Admin Panel:   http://localhost:${PORT}/admin.html`);
  console.log(`[DB] Database Status:  http://localhost:${PORT}/api/status`);
  console.log(`[File] Database File:  ${path.join(__dirname, 'yeliyuru.db')}`);
  console.log(`=======================================================`);
});
