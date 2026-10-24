/**
 * Service Worker - إدارة الحلقات القرآنية - شباب مسجد قطنا
 *
 * الاستراتيجية:
 *  - ملفات التطبيق (HTML / JS / CSS / manifest): الشبكة أولاً ثم الكاش عند الفشل أو البطء.
 *  - المكتبات والخطوط والصور: الكاش أولاً.
 *
 * تعديل مهم (1.3.0): الملفات الأساسية (CORE) إما تُخزَّن كلها أو يفشل التثبيت ويبقى الكاش
 * القديم سليماً. سابقاً كان فشل أي ملف يُتجاهل، ثم يُحذف الكاش القديم فيبقى التطبيق بلا ملفات أوفلاين.
 *
 * متى أغيّر VERSION؟ عند إضافة/حذف/استبدال ملف في القوائم أدناه.
 */

const VERSION = '1.3.0';
const CACHE_PREFIX = 'qatana-quran-circles-';
const CACHE_NAME = `${CACHE_PREFIX}v${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

// ملفات لا يعمل التطبيق بدونها: يجب أن تُخزَّن كلها وإلا يفشل التثبيت
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/style.css',
  './js/db.js',
  './js/ui.js',
  './js/students.js',
  './js/points.js',
  './js/qr-scanner.js',
  './js/cards-pdf.js',
  './libs/html5-qrcode.min.js',
  './libs/qrious.min.js',
  './libs/jspdf.umd.min.js'
];

// ملفات اختيارية: إن لم تُوجد لا يتأثر التثبيت
const OPTIONAL_ASSETS = [
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './libs/fonts/Tajawal-Regular.woff2',
  './libs/fonts/Tajawal-Bold.woff2',
  './libs/fonts/Cairo-Regular.woff2',
  './libs/fonts/Cairo-Bold.woff2',
  './libs/fonts/Amiri-Regular.woff2',
  './libs/fonts/Amiri-Bold.woff2'
];

async function fetchAndStore(cache, url, required) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (!response || !response.ok) throw new Error(`HTTP ${response && response.status}`);
    await cache.put(url, response);
  } catch (err) {
    if (required) throw new Error(`فشل تخزين ملف أساسي: ${url} (${err.message})`);
    console.warn('[SW] ملف اختياري غير متوفر:', url);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await Promise.all(CORE_ASSETS.map((u) => fetchAndStore(cache, u, true)));
      } catch (err) {
        // لا نترك كاشاً ناقصاً؛ يبقى الإصدار القديم يعمل ويُعاد المحاولة لاحقاً
        await caches.delete(CACHE_NAME);
        throw err;
      }
      await Promise.all(OPTIONAL_ASSETS.map((u) => fetchAndStore(cache, u, false)));
      await self.skipWaiting();
    })()
  );
});

// إكمال أي ملف أساسي ناقص (علاج ذاتي) عند توفر الإنترنت
async function healCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const url of CORE_ASSETS) {
      if (!(await cache.match(url))) {
        await fetchAndStore(cache, url, false);
      }
    }
  } catch (e) {
    /* بدون إنترنت: لا شيء */
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
      await healCache();
    })()
  );
});

async function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal, cache: 'no-cache' });
  } finally {
    clearTimeout(timer);
  }
}

async function matchCached(cache, request) {
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (await caches.match(request, { ignoreSearch: true }))
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await matchCached(cache, request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell =
        (await cache.match('./index.html')) ||
        (await cache.match('./')) ||
        (await caches.match('./index.html'));
      if (shell) return shell;
    }
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await matchCached(cache, request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isStatic =
    url.pathname.includes('/libs/') ||
    /\.(png|jpe?g|webp|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);

  event.respondWith(isStatic ? cacheFirst(request) : networkFirst(request));
});