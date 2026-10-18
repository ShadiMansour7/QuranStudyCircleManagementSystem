/**
 * Service Worker - إدارة الحلقات القرآنية - شباب مسجد قطنا
 * يضمن تخزين كافة ملفات النظام والمكتبات محلياً للعمل أوفلاين 100%
 */

const CACHE_NAME = 'qatana-quran-circles-v1.0.0';

const ASSETS_TO_CACHE = [
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

// حدث التثبيت: تخزين جميع ملفات المشروع في الكاش المحلي
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // تخزين كل ملف على حدة لضمان عدم فشل التثبيت في حال تأخر إضافة إحدى الصور يدوياً
      const cachePromises = ASSETS_TO_CACHE.map(async (assetUrl) => {
        try {
          const response = await fetch(assetUrl, { cache: 'reload' });
          if (response && response.ok) {
            await cache.put(assetUrl, response);
          }
        } catch (err) {
          console.warn('[SW] تعذر تخزين الملف مؤقتاً أثناء التثبيت:', assetUrl, err);
        }
      });
      await Promise.all(cachePromises);
      return self.skipWaiting();
    })
  );
});

// حدث التفعيل: مسح أي كاش قديم والسيطرة الفورية على الصفحات المفتوحة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// حدث الجلب (Fetch): استراتيجية الكاش أولاً ثم الشبكة مع دعم كامل للأوفلاين
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // في حال انقطاع الإنترنت وطلب صفحة تنقل، أعد الصفحة الرئيسية
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
