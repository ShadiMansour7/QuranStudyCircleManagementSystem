/**
 * Service Worker - إدارة الحلقات القرآنية - شباب مسجد قطنا
 *
 * الاستراتيجية:
 *  - ملفات التطبيق (HTML / JS / CSS / manifest): الشبكة أولاً ثم الكاش عند الفشل أو البطء
 *    => أي تعديل تنشره يصل للمستخدم عند أول تحديث للصفحة وهو متصل، ويبقى التطبيق يعمل أوفلاين.
 *  - المكتبات والخطوط والصور (libs/ وأيقونات وخطوط): الكاش أولاً (لا تتغير غالباً، وتوفّر البيانات).
 *
 * متى أغيّر VERSION؟ فقط عند استبدال/حذف ملف مكتبة أو أيقونة أو خط، لتنظيف الكاش القديم.
 * تعديلات الكود العادية لا تحتاج تغيير الرقم.
 */

const VERSION = '1.2.0';
const CACHE_PREFIX = 'qatana-quran-circles-';
const CACHE_NAME = `${CACHE_PREFIX}v${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000; // أطول مهلة ننتظرها الشبكة قبل الرجوع للكاش

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './css/style.css',
  './js/db.js',
  './js/ui.js',
  './js/students.js',
  './js/points.js',
  './js/qr-scanner.js',
  './js/cards-pdf.js',
  './libs/html5-qrcode.min.js',
  './libs/qrious.min.js',
  './libs/jspdf.umd.min.js',
  './libs/fonts/Tajawal-Regular.woff2',
  './libs/fonts/Tajawal-Bold.woff2',
  './libs/fonts/Cairo-Regular.woff2',
  './libs/fonts/Cairo-Bold.woff2',
  './libs/fonts/Amiri-Regular.woff2',
  './libs/fonts/Amiri-Bold.woff2'
];

// التثبيت: تخزين كل ملف على حدة حتى لا يفشل التثبيت كله بسبب ملف ناقص
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        ASSETS_TO_CACHE.map(async (assetUrl) => {
          try {
            const response = await fetch(assetUrl, { cache: 'reload' });
            if (response && response.ok) {
              await cache.put(assetUrl, response);
            }
          } catch (err) {
            console.warn('[SW] تعذر تخزين الملف أثناء التثبيت:', assetUrl, err);
          }
        })
      );
      return self.skipWaiting();
    })
  );
});

// التفعيل: حذف كاش الإصدارات القديمة فقط (يخص هذا التطبيق) والسيطرة الفورية
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

// جلب من الشبكة مع مهلة، وتجاوز كاش المتصفح العادي لضمان أحدث نسخة
async function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal, cache: 'no-cache' });
  } finally {
    clearTimeout(timer);
  }
}

// الشبكة أولاً → الكاش عند الفشل/البطء → صفحة التطبيق الرئيسية للتنقل
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  }
}

// الكاش أولاً → الشبكة (مع تخزين النتيجة) للملفات الثابتة
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
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
  if (url.origin !== self.location.origin) return; // لا نتدخل بطلبات خارجية

  const isStatic =
    url.pathname.includes('/libs/') ||
    /\.(png|jpe?g|webp|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);

  event.respondWith(isStatic ? cacheFirst(request) : networkFirst(request));
});