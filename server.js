/**
 * Zen Proxy v2 — 本地代理转发到 OpenCode Zen API。
 *
 * http://127.0.0.1:5678/v1/chat/completions
 *   → https://opencode.ai/zen/v1/chat/completions
 *
 * Hanako 的 base_url 配为 http://127.0.0.1:5678/v1
 * 支持 streaming (SSE) 和非流式，带 CORS，本机无鉴权。
 */

const http = require('http');
const https = require('https');

const ZEN_BASE = 'https://opencode.ai/zen/v1/chat/completions';
const PORT = 5678;
const HOST = '127.0.0.1';

// 从环境变量读取 API Key（优先），其次 fallback 到硬编码
const API_KEY = process.env.ZEN_API_KEY || 'sk-pzwKuHcOb1vmo3Pw2J0msmWEYeLiiwOfLvIYsoxUvrfvVOo8drWzH0d6imHS0W0l';

let requestCount = 0;
let errorCount = 0;

function log(...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [zen-proxy]`, ...args);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON in request body')); }
    });
    req.on('error', reject);
  });
}

function writeJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Connection': 'keep-alive',
  });
  res.end(body);
}

function proxyRequest(targetUrl, bodyJson, isStream, res) {
  const url = new URL(targetUrl);

  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Length': Buffer.byteLength(bodyJson),
    },
    timeout: 60000,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const respHeaders = {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Connection': 'keep-alive',
    };

    res.writeHead(proxyRes.statusCode, respHeaders);

    if (isStream) {
      proxyRes.pipe(res);
      proxyRes.on('end', () => log(`↑ stream done (status ${proxyRes.statusCode})`));
    } else {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.end(data);
        log(`↑ ${proxyRes.statusCode} · ${data.length} bytes`);
      });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    log('✗ upstream timeout');
    if (!res.headersSent) writeJSON(res, 504, { error: { message: 'Upstream timeout (60s)' } });
  });

  proxyReq.on('error', (err) => {
    errorCount++;
    log(`✗ upstream error: ${err.message}`);
    if (!res.headersSent) {
      writeJSON(res, 502, { error: { message: `Proxy error: ${err.message}` } });
    }
  });

  proxyReq.write(bodyJson);
  proxyReq.end();
}

// ─── 服务端 ───────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // ── 健康检查 ──
  if (req.url === '/health') {
    writeJSON(res, 200, {
      status: 'ok',
      upstream: ZEN_BASE,
      uptime: process.uptime().toFixed(0) + 's',
      requests: requestCount,
      errors: errorCount,
    });
    return;
  }

  // ── 统计 ──
  if (req.url === '/stats') {
    writeJSON(res, 200, {
      requests: requestCount,
      errors: errorCount,
      uptime: process.uptime().toFixed(0) + 's',
    });
    return;
  }

  // 只接受 POST 到 /v1/chat/completions
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    writeJSON(res, 404, { error: { message: `Not found: ${req.method} ${req.url}` } });
    return;
  }

  // 解析请求体
  let bodyObj;
  try {
    bodyObj = await parseBody(req);
  } catch (e) {
    writeJSON(res, 400, { error: { message: e.message } });
    return;
  }

  requestCount++;
  const model = bodyObj.model || 'unknown';
  const msgCount = bodyObj.messages?.length || 0;
  const isStream = !!bodyObj.stream;

  log(`→ ${model} · ${msgCount} messages ${isStream ? '(stream)' : ''}`);

  proxyRequest(ZEN_BASE, JSON.stringify(bodyObj), isStream, res);
});

server.listen(PORT, HOST, () => {
  log(`运行在 http://${HOST}:${PORT}`);
  log(`上游: ${ZEN_BASE}`);
  log(`Hanako base_url → http://${HOST}:${PORT}/v1`);
});

// ── 优雅退出 ──
function shutdown(signal) {
  log(`收到 ${signal}，关闭服务`);
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  log(`✗ 未捕获异常: ${err.message}`);
  // 不退出，保持服务运行
});
process.on('unhandledRejection', (err) => {
  log(`✗ 未处理 Promise 拒绝: ${err?.message || err}`);
});
