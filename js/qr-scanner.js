/**
 * منطق قارئ الـ QR الفائق السرعة (qr-scanner.js) - شباب مسجد قطنا
 * يعمل بأسلوب السوبر ماركت دون إغلاق الكاميرا بعد القراءة، ويدعم:
 * 1. الكاميرا بوضع القراءة المستمرة عبر مكتبة html5-qrcode (fps: 15, qrbox: { width: 250, height: 250 }).
 * 2. قارئ الباركود الليزري الخارجي (Hardware Scanner / Keyboard Wedge) عبر مستمع keypress مع مؤقت تصفير 50ms.
 * 3. صوت "بيب" فوري عبر Web Audio API (تردد 1500Hz لمدة 100ms) بدون ملفات خارجية.
 * 4. مهلة منع تكرار (Cooldown لمدة 2000ms لنفس الكود lastScanned) وإشعار Toast لمدة ثانيتين (2000ms).
 */

const QRScanner = {
  html5QrCodeInstance: null,
  isCameraRunning: false,
  audioCtx: null,

  // متغيرات منع التكرار (Cooldown 2000ms) وإحصائية الجلسة
  lastScanned: {
    code: null,
    timestamp: 0
  },
  cooldownMs: 2000,
  sessionScanCount: 0,

  // متغيرات قارئ الليزر الخارجي (Keyboard Wedge)
  wedgeBuffer: '',
  wedgeTimeoutId: null,
  wedgeResetDelayMs: 50,

  init() {
    this.bindEvents();
    this.initHardwareKeyboardWedgeListener();
  },

  /* ========================================================================
     1. ربط أحداث نافذة الماسح وأزرار الكاميرا
     ======================================================================== */

  bindEvents() {
    // زر فتح نافذة الماسح السريع من واجهة إدارة النقاط
    const openScannerBtn = document.getElementById('btn-open-qr-scanner');
    if (openScannerBtn) {
      openScannerBtn.addEventListener('click', () => {
        this.openScannerModal();
      });
    }

    // زر تشغيل الكاميرا
    const startCamBtn = document.getElementById('btn-start-camera-scan');
    if (startCamBtn) {
      startCamBtn.addEventListener('click', () => {
        this.startCamera();
      });
    }

    // زر إيقاف الكاميرا
    const stopCamBtn = document.getElementById('btn-stop-camera-scan');
    if (stopCamBtn) {
      stopCamBtn.addEventListener('click', () => {
        this.stopCamera();
      });
    }

    // تحديث السبب التلقائي عند تغيير نوع العملية بين (حضور/إضافة) و (غياب/خصم)
    const opTypeSelect = document.getElementById('qr-operation-type');
    if (opTypeSelect) {
      opTypeSelect.addEventListener('change', (e) => {
        const reasonInput = document.getElementById('qr-points-reason');
        if (!reasonInput) return;
        if (
          e.target.value === 'deduct' &&
          reasonInput.value.trim() === 'تسجيل حضور عبر بطاقة QR'
        ) {
          reasonInput.value = 'خصم غياب عبر مسح QR';
        } else if (
          e.target.value === 'add' &&
          reasonInput.value.trim() === 'خصم غياب عبر مسح QR'
        ) {
          reasonInput.value = 'تسجيل حضور عبر بطاقة QR';
        }
      });
    }
  },

  openScannerModal() {
    this.sessionScanCount = 0;
    this.lastScanned = { code: null, timestamp: 0 };
    this.updateSessionCounterUI();

    UI.openModal('modal-qr-scanner');

    // تهيئة سياق الصوت مبكراً عند تفاعل المستخدم
    this.ensureAudioContext();

    // بدء تشغيل الكاميرا تلقائياً فور فتح النافذة لتوفير الوقت
    this.startCamera();
  },

  onScannerModalClosed() {
    this.stopCamera();
  },

  updateSessionCounterUI() {
    const counterEl = document.getElementById('qr-session-counter');
    if (counterEl) {
      counterEl.textContent = `إجمالي العمليات في هذه الجلسة: ${this.sessionScanCount}`;
    }
  },

  /* ========================================================================
     2. تشغيل وإيقاف كاميرا الـ QR بوضع القراءة المستمرة (html5-qrcode)
     ======================================================================== */

  async startCamera() {
    if (this.isCameraRunning) return;

    const statusText = document.getElementById('qr-scanner-status-text');
    const startBtn = document.getElementById('btn-start-camera-scan');
    const stopBtn = document.getElementById('btn-stop-camera-scan');

    if (typeof Html5Qrcode === 'undefined') {
      if (statusText) {
        statusText.textContent = 'مكتبة الكاميرا غير محملة، قارئ الليزر الخارجي يعمل بشكل طبيعي';
      }
      UI.showToast('تأكد من وجود ملف libs/html5-qrcode.min.js لتشغيل الكاميرا', 'warning', 3000);
      return;
    }

    try {
      this.ensureAudioContext();

      if (!this.html5QrCodeInstance) {
        this.html5QrCodeInstance = new Html5Qrcode('qr-reader');
      }

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await this.html5QrCodeInstance.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          // القراءة المستمرة دون إيقاف الكاميرا
          this.handleScannedCode(decodedText, 'camera');
        },
        () => {
          // تجاهل أخطاء الإطارات الفارغة أثناء البحث المستمر عن رمز QR
        }
      );

      this.isCameraRunning = true;
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-flex';
      if (statusText) {
        statusText.textContent = 'الكاميرا نشطة بوضع المسح المستمر + قارئ الليزر جاهز';
      }
    } catch (err) {
      console.warn('[QRScanner] تعذر تشغيل الكاميرا:', err);
      this.isCameraRunning = false;
      if (startBtn) startBtn.style.display = 'inline-flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (statusText) {
        statusText.textContent = 'تعذر الوصول للكاميرا — قارئ الباركود الليزري جاهز للعمل';
      }
      UI.showToast('تعذر فتح الكاميرا (تحقق من صلاحية الكاميرا أو استخدم قارئ الليزر)', 'warning', 2800);
    }
  },

  async stopCamera() {
    const startBtn = document.getElementById('btn-start-camera-scan');
    const stopBtn = document.getElementById('btn-stop-camera-scan');
    const statusText = document.getElementById('qr-scanner-status-text');

    if (this.html5QrCodeInstance && this.isCameraRunning) {
      try {
        await this.html5QrCodeInstance.stop();
        await this.html5QrCodeInstance.clear();
      } catch (err) {
        console.warn('[QRScanner] تنبيه أثناء إيقاف الكاميرا:', err);
      }
    }

    this.isCameraRunning = false;
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    if (statusText) {
      statusText.textContent = 'قارئ الليزر الخارجي (USB/Wireless) جاهز للاستقبال الفوري';
    }
  },

  /* ========================================================================
     3. مستمع قارئ الباركود الخارجي (Hardware Scanner / Keyboard Wedge)
     ======================================================================== */

  initHardwareKeyboardWedgeListener() {
    document.addEventListener('keypress', (e) => {
      // تجاهل الالتقاط إذا كان المستخدم يكتب يدوياً داخل حقل إدخال نصي أو textarea
      const activeEl = document.activeElement;
      const isTypingInField =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable);

      if (isTypingInField) {
        return;
      }

      // يعمل قارئ الليزر عندما تكون نافذة الماسح مفتوحة أو عندما يكون المستخدم داخل واجهة إدارة النقاط
      const qrModal = document.getElementById('modal-qr-scanner');
      const pointsSection = document.getElementById('view-points');
      const isScannerModalOpen = qrModal && qrModal.classList.contains('active');
      const isPointsViewActive = pointsSection && pointsSection.classList.contains('active');

      if (!isScannerModalOpen && !isPointsViewActive) {
        return;
      }

      if (this.wedgeTimeoutId) {
        clearTimeout(this.wedgeTimeoutId);
      }

      if (e.key === 'Enter') {
        const scannedCode = this.wedgeBuffer.trim();
        this.wedgeBuffer = '';
        if (scannedCode.length >= 3) {
          e.preventDefault();
          this.handleScannedCode(scannedCode, 'laser');
        }
        return;
      }

      // تجميع الأحرف المطبوعة بسرعة فائقة من قارئ الليزر
      if (e.key && e.key.length === 1) {
        this.wedgeBuffer += e.key;
      }

      // مؤقت تصفير 50ms لمنع تداخل ضغطات لوحة المفاتيح اليدوية البطيئة
      this.wedgeTimeoutId = setTimeout(() => {
        this.wedgeBuffer = '';
      }, this.wedgeResetDelayMs);
    });
  },

  /* ========================================================================
     4. معالجة الكود الممسوح، منع التكرار (Cooldown 2s)، وصوت Beep (1500Hz / 100ms)
     ======================================================================== */

  handleScannedCode(rawCode, source = 'camera') {
    const cleanCode = String(rawCode || '').trim().toUpperCase();
    if (!cleanCode) return;

    const now = Date.now();

    // التحقق من مهلة منع التكرار (Cooldown لمدة ثانيتين 2000ms لنفس الكود)
    if (
      this.lastScanned.code === cleanCode &&
      now - this.lastScanned.timestamp < this.cooldownMs
    ) {
      return;
    }

    this.lastScanned = {
      code: cleanCode,
      timestamp: now
    };

    // قراءة إعدادات العملية الحالية من واجهة الماسح
    const opTypeEl = document.getElementById('qr-operation-type');
    const amountEl = document.getElementById('qr-points-amount');
    const reasonEl = document.getElementById('qr-points-reason');

    const operationType = opTypeEl ? opTypeEl.value : 'add';
    const pointsAmount = amountEl ? Math.abs(Number(amountEl.value)) || 5 : 5;
    const reason =
      reasonEl && reasonEl.value.trim()
        ? reasonEl.value.trim()
        : operationType === 'deduct'
        ? 'خصم غياب عبر مسح QR'
        : 'تسجيل حضور عبر بطاقة QR';

    try {
      const result = DB.modifyStudentPoints(cleanCode, pointsAmount, operationType, reason);

      // إصدار صوت البيب الفوري (1500Hz لمدة 100ms)
      this.playBeepSound();

      // زيادة عداد الجلسة وتحديث جدول المراكز خلف النافذة فوراً
      this.sessionScanCount++;
      this.updateSessionCounterUI();

      if (window.PointsView) {
        window.PointsView.renderLeaderboard();
      }

      const signStr =
        result.logEntry.change >= 0
          ? `+${result.logEntry.change}`
          : `${result.logEntry.change}`;

      // إظهار إشعار Toast سفلي غير معطل للعمل لمدة ثانيتين (2000ms)
      UI.showToast(
        `[${result.student.id}] ${result.student.name} (${signStr} نقطة) • الرصيد: ${result.student.points}`,
        result.logEntry.change >= 0 ? 'success' : 'warning',
        2000
      );
    } catch (err) {
      // في حال مسح بطاقة غير مسجلة في النظام
      UI.showToast(
        `الكود (${cleanCode}) غير مسجل لأي طالب في النظام!`,
        'error',
        2000
      );
    }
  },

  /* ========================================================================
     5. توليد صوت "بيب" فوري عبر Web Audio API (1500Hz لمدة 100ms)
     ======================================================================== */

  ensureAudioContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch (e) {
      return null;
    }
  },

  playBeepSound() {
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1500, ctx.currentTime); // تردد 1500Hz كما هو محدد

      gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1); // لمدة 100ms (0.1 ثانية)
    } catch (err) {
      console.warn('[QRScanner] تعذر تشغيل نغمة Beep:', err);
    }
  }
};

window.QRScanner = QRScanner;
document.addEventListener('DOMContentLoaded', () => {
  QRScanner.init();
});