/* ==========================================================================
 * FormulaX 下载桥 sw.js v1.1
 * --------------------------------------------------------------------------
 * 作用：让导出文件走「真实同源 URL」下载，绕开 UC/QQ 等浏览器下载器对
 * blob: 链接「下载超时」的问题。
 *
 * 原理：页面把生成的文件字节通过 postMessage 交给本 SW，SW 暂存后返回
 * 一个真实同源地址（/__fxdl__/<token>/<文件名>）。浏览器下载器请求该地址时，
 * SW 用文件字节应答，并带 Content-Disposition: attachment —— 对下载器来说
 * 这就是一次普通的 HTTP 文件下载，与从网站下载任何文件无异。
 *
 * v1.1 关键修复（对应 UC「下载超时」复发）：
 *   1. 同一 token 可多次取流。v1.0 是「取走即删」——UC 等下载器常先发探测
 *      请求（HEAD/Range/首次 GET）再正式下载，探测就消耗掉一次性 token，
 *      正式请求 404 → 下载超时。现在 token 在 TTL 内可重复响应。
 *   2. install 即 skipWaiting + activate 时 clients.claim：部署新版 sw.js
 *      后立即生效，不再滞留旧版本。
 *   3. 暂存上限 20 份 + 30 分钟 TTL 清理，防内存膨胀。
 *
 * 部署：与 index.html 放同一目录（GitHub Pages 仓库根目录）即可，页面自动
 * 注册。未部署本文件时页面自动回退为 blob 下载并在提示条说明原因。
 * 本 SW 不缓存页面资源，不影响应用版本更新。
 * ========================================================================== */
'use strict';

var FXDL_FILES = {};      // token -> { name, buffer, time }
var FXDL_PREFIX = '/__fxdl__/';
var FXDL_TTL = 30 * 60 * 1000;   // 30 分钟后丢弃未取走的文件
var FXDL_MAX = 20;               // 暂存上限（防内存膨胀）

self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (ev) {
  ev.waitUntil(self.clients.claim());
});

function fxDlSweep() {
  var now = Date.now();
  var keys = Object.keys(FXDL_FILES);
  keys.forEach(function (t) {
    if (now - FXDL_FILES[t].time > FXDL_TTL) delete FXDL_FILES[t];
  });
  keys = Object.keys(FXDL_FILES);
  while (keys.length > FXDL_MAX) {
    var oldest = keys[0];
    for (var i = 1; i < keys.length; i++) {
      if (FXDL_FILES[keys[i]].time < FXDL_FILES[oldest].time) oldest = keys[i];
    }
    delete FXDL_FILES[oldest];
    keys = Object.keys(FXDL_FILES);
  }
}

self.addEventListener('message', function (ev) {
  var d = ev.data || {};
  if (!d || d.type !== 'fxdl' || !d.name || !d.buffer) return;
  fxDlSweep();
  var token = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  FXDL_FILES[token] = { name: String(d.name), buffer: d.buffer, time: Date.now() };
  var port = (ev.ports && ev.ports[0]) || null;
  if (port) {
    try { port.postMessage({ ok: true, token: token, path: FXDL_PREFIX + token + '/' + encodeURIComponent(String(d.name)) }); } catch (e) {}
  }
});

self.addEventListener('fetch', function (ev) {
  var url = new URL(ev.request.url);
  var idx = url.pathname.indexOf('__fxdl__/');
  if (idx < 0) return;   // 其余请求一律不接管（支持根路径 / 子路径部署）
  var rest = url.pathname.slice(idx + '__fxdl__/'.length);
  var token = rest.split('/')[0];
  var rec = FXDL_FILES[token];
  if (rec) {
    // v1.1：不删 token —— 探测请求与正式下载请求都拿到完整文件，
    // 同一地址在 TTL 内可重复下载，彻底规避「先探测后下载」型下载器
    var filename = rec.name || 'download';
    var asciiName = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'download';
    ev.respondWith(new Response(rec.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(rec.buffer.byteLength || rec.buffer.length || 0),
        'Content-Disposition': 'attachment; filename="' + asciiName + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename),
        'Cache-Control': 'no-store'
      }
    }));
  } else {
    ev.respondWith(new Response('expired or not found', { status: 404 }));
  }
});
