/**
 * جلسة الحضور والغياب بكاميرا الموبايل (qr-scanner.js) - شباب مسجد قطنا
 * - قراءة مستمرة بدون إيقاف الكاميرا بين بطاقة وأخرى (15 FPS).
 * - كل بطاقة ممسوحة = طالب حاضر (تُجمع في الجلسة، ولا تُطبَّق النقاط فوراً).
 * - عند "إنهاء الجلسة": إضافة نقاط الحضور مع السبب لكل الحاضرين، وخصم نقاط الغياب
 *   مع سببها من بقية طلاب الحلقة (إلا إذا كانت نقاط الخصم 0).
 * - الجلسة تبقى محفوظة في الذاكرة عند إغلاق النافذة، حتى الإنهاء أو الإلغاء.
 */
const QRScanner = {
  html5QrCodeInstance: null,
  isCameraRunning: false,
  audioCtx: null,
  lastScanned: { code: null, timestamp: 0 },
  cooldownMs: 2000,
  presentIds: [], // معرّفات الحاضرين بترتيب المسح
  cameras: [], // [{ id, label, score }] مرتّبة: الخلفية الرئيسية أولاً ثم بقية الخلفية ثم الأمامية
  currentCameraId: null,
  preferredCameraId: null, // اختيار المستخدم خلال هذه الجلسة فقط؛ الافتراضي دائماً الخلفية الرئيسية
  isStarting: false,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    on('btn-open-qr-scanner', () => this.openScannerModal());
    on('btn-start-camera-scan', () => this.startCamera());
    on('btn-stop-camera-scan', () => this.stopCamera());
    on('btn-switch-camera-scan', () => this.switchCamera());
    on('btn-finish-attendance', () => this.finishSession());

    // تغيير الحلقة يعيد حساب الغائبين المتوقعين
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'qr-circle') this.renderSessionPanel();
    });

    // حذف حاضر بالخطأ أو إلغاء الجلسة (من لوحة الجلسة)
    const panel = document.getElementById('qr-session-panel');
    if (panel) {
      panel.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-remove-id]');
        if (rm) {
          this.presentIds = this.presentIds.filter((id) => id !== rm.getAttribute('data-remove-id'));
          this.renderSessionPanel();
        } else if (e.target.closest('#btn-clear-session')) {
          if (this.presentIds.length && !window.confirm('إلغاء الجلسة ومسح كل الحاضرين الممسوحين؟')) return;
          this.presentIds = [];
          this.renderSessionPanel();
        }
      });
    }
  },

  openScannerModal() {
    UI.fillAttendanceCircles('qr');
    UI.openModal('modal-qr-scanner');
    this.ensureAudioContext();
    this.renderSessionPanel();
    this.startCamera(); // الجلسة السابقة (إن وُجدت) تبقى كما هي
  },

  onScannerModalClosed() {
    this.stopCamera();
  },

  /* ===== لوحة الجلسة: الحاضرون والغائبون المتوقعون ===== */
  renderSessionPanel() {
    const panel = document.getElementById('qr-session-panel');
    const counter = document.getElementById('qr-session-counter');
    if (!panel) return;

    const circleSel = document.getElementById('qr-circle');
    const circleId = circleSel ? circleSel.value : '';
    const present = this.presentIds.map((id) => DB.getStudentById(id)).filter(Boolean);
    const presentSet = new Set(present.map((s) => s.id));
    const absent = circleId
      ? DB.getStudents({ circleId, sortAlphabetically: true }).filter((s) => !presentSet.has(s.id))
      : [];

    const chips = present
      .map(
        (s) => `<span style="display:inline-flex;align-items:center;gap:.35rem;background:var(--primary-soft);border:1px solid var(--primary-border);border-radius:999px;padding:.15rem .6rem;margin:.15rem;font-size:.85rem;">
          ${UI.escapeHtml(s.name)} <button type="button" data-remove-id="${UI.escapeHtml(s.id)}" aria-label="إزالة" style="border:none;background:none;cursor:pointer;color:inherit;">✕</button></span>`
      )
      .join('');
    const absentNames = absent.slice(0, 12).map((s) => UI.escapeHtml(s.name)).join('، ');

    panel.innerHTML = `
      <div style="margin-top:.75rem;">
        <strong>✅ الحاضرون (${present.length})</strong>
        <div>${chips || '<span style="color:var(--text-secondary);font-size:.85rem;">لم يُمسح أي طالب بعد</span>'}</div>
      </div>
      <div style="margin-top:.6rem;font-size:.88rem;color:var(--text-secondary);">
        ❌ الغائبون المتوقعون: <strong>${circleId ? absent.length : '—'}</strong>
        ${circleId ? (absentNames ? '(' + absentNames + (absent.length > 12 ? '…' : '') + ')' : '') : '(اختر الحلقة لعرضهم)'}
      </div>
      ${present.length ? '<button type="button" id="btn-clear-session" class="btn btn-sm btn-danger-outline" style="margin-top:.5rem;">إلغاء الجلسة</button>' : ''}`;

    if (counter) counter.textContent = `الحاضرون في الجلسة: ${present.length}`;
  },

  /* ===== إنهاء الجلسة وتطبيق النقاط ===== */
  finishSession() {
    const cfg = UI.readAttendanceFields('qr');
    try {
      const preview = DB.applyAttendanceSession({ ...cfg, presentTokens: this.presentIds, dryRun: true });
      const lines = [];
      if (cfg.presentPoints > 0) {
        lines.push(`➕ ${cfg.presentPoints} نقطة لـ ${preview.presentCount} حاضر (السبب: ${cfg.presentReason})`);
      }
      if (cfg.absentPoints > 0) {
        lines.push(`➖ ${cfg.absentPoints} نقطة من ${preview.absentCount} غائب (السبب: ${cfg.absentReason})`);
      }
      if (!window.confirm('تأكيد إنهاء الجلسة:\n' + lines.join('\n'))) return;

      const result = DB.applyAttendanceSession({ ...cfg, presentTokens: this.presentIds });
      this.presentIds = [];
      this.renderSessionPanel();
      if (window.PointsView) window.PointsView.renderLeaderboard();
      UI.closeModal('modal-qr-scanner');
      this.stopCamera();
      UI.showToast(`تم تطبيق الجلسة: ${result.presentCount} حاضر • ${result.absentCount} غائب`, 'success', 3000);
    } catch (err) {
      UI.showToast(err.message || 'تعذر إنهاء الجلسة', 'error', 3000);
    }
  },

  /* ===== اختيار الكاميرا: الخلفية الرئيسية افتراضياً + إمكانية التبديل ===== */

  // تقدير "رئيسية خلفية" من اسم الكاميرا (يختلف حسب الجهاز والمتصفح):
  //   iOS: "Back Camera" رئيسية، و"Back Ultra Wide Camera" / "Back Telephoto Camera" ثانوية
  //   Android: "camera2 0, facing back" رئيسية عادةً (الأرقام الأكبر عدسات إضافية)
  _cameraScore(cam) {
    const l = String((cam && cam.label) || '').toLowerCase();
    let s = 0;
    if (/back|rear|environment|world|خلف/.test(l)) s += 100;
    else if (/front|user|facetime|selfie|أمام/.test(l)) s -= 100;
    if (/ultra|tele|macro|depth|mono|infrared|\bir\b|zoom/.test(l)) s -= 50;
    if (/triple|dual/.test(l)) s += 10; // كاميرات iOS المركّبة تبدّل العدسات تلقائياً
    if (l.trim() === 'back camera') s += 20;
    const m = l.match(/camera2?\s*(\d+)/);
    if (m) s -= Number(m[1]) * 5;
    return s;
  },

  async loadCameras() {
    try {
      const list = await Html5Qrcode.getCameras(); // يطلب الصلاحية فتصير الأسماء متاحة
      this.cameras = (Array.isArray(list) ? list : [])
        .map((c, i) => ({ id: c.id, label: c.label || '', score: this._cameraScore(c), order: i }))
        .sort((a, b) => b.score - a.score || a.order - b.order);
    } catch (err) {
      console.warn('[QRScanner] تعذر جلب قائمة الكاميرات:', err);
      this.cameras = [];
    }
    return this.cameras;
  },

  // الكاميرا المقصودة: اختيار المستخدم في هذه الجلسة، وإلا الخلفية الرئيسية، وإلا null (يُستعمل facingMode)
  _targetCameraId() {
    if (this.preferredCameraId && this.cameras.some((c) => c.id === this.preferredCameraId)) {
      return this.preferredCameraId;
    }
    return this.cameras.length && this.cameras[0].score > 0 ? this.cameras[0].id : null;
  },

  _cameraName(id) {
    const idx = this.cameras.findIndex((c) => c.id === id);
    if (idx === -1) return '';
    const c = this.cameras[idx];
    const kind = /back|rear|environment|world|خلف/i.test(c.label) ? 'خلفية' : /front|user|facetime|selfie|أمام/i.test(c.label) ? 'أمامية' : 'كاميرا';
    return `${kind} ${idx + 1}/${this.cameras.length}${c.label ? ' (' + c.label + ')' : ''}`;
  },

  _syncCameraButtons() {
    const sw = document.getElementById('btn-switch-camera-scan');
    if (sw) sw.style.display = this.isCameraRunning && this.cameras.length > 1 ? 'inline-flex' : 'none';
  },

  async switchCamera() {
    if (this.isStarting || this.cameras.length < 2) return;
    const idx = this.cameras.findIndex((c) => c.id === this.currentCameraId);
    const next = this.cameras[(idx + 1) % this.cameras.length];
    this.preferredCameraId = next.id;
    await this.stopCamera();
    await this.startCamera(next.id);
  },

  /* ===== الكاميرا: قراءة مستمرة بدون إغلاق بعد كل بطاقة ===== */
  async startCamera(forcedCameraId) {
    if (this.isCameraRunning || this.isStarting) return;
    const statusText = document.getElementById('qr-scanner-status-text');
    const startBtn = document.getElementById('btn-start-camera-scan');
    const stopBtn = document.getElementById('btn-stop-camera-scan');

    if (typeof Html5Qrcode === 'undefined') {
      if (statusText) statusText.textContent = 'مكتبة الكاميرا غير محملة';
      UI.showToast('تأكد من وجود ملف libs/html5-qrcode.min.js', 'warning', 3000);
      return;
    }

    this.isStarting = true;
    try {
      this.ensureAudioContext();
      if (!this.html5QrCodeInstance) this.html5QrCodeInstance = new Html5Qrcode('qr-reader');
      if (!this.cameras.length) await this.loadCameras();

      // المحاولات بالترتيب: الكاميرا المقصودة، ثم الخلفية عبر facingMode، ثم أي كاميرا متاحة
      const attempts = [];
      const target = typeof forcedCameraId === 'string' ? forcedCameraId : this._targetCameraId();
      if (target) attempts.push(target);
      attempts.push({ facingMode: 'environment' });
      if (this.cameras.length && !attempts.includes(this.cameras[0].id)) attempts.push(this.cameras[0].id);

      const scanConfig = { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
      const onDecoded = (decodedText) => this.handleScannedCode(decodedText);
      let started = null;
      let lastErr = null;
      for (const cfg of attempts) {
        try {
          await this.html5QrCodeInstance.start(cfg, scanConfig, onDecoded, () => {}); // تجاهل الإطارات الفارغة
          started = cfg;
          break;
        } catch (e) {
          lastErr = e;
          console.warn('[QRScanner] فشلت محاولة تشغيل الكاميرا:', cfg, e);
        }
      }
      if (started === null) throw lastErr || new Error('no camera');

      this.isCameraRunning = true;
      this.currentCameraId = typeof started === 'string' ? started : null;
      if (!this.currentCameraId) {
        try {
          const st = this.html5QrCodeInstance.getRunningTrackSettings();
          this.currentCameraId = (st && st.deviceId) || null;
        } catch (e) {
          /* تجاهل */
        }
      }
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-flex';
      const name = this._cameraName(this.currentCameraId);
      if (statusText) {
        statusText.textContent = 'الكاميرا تعمل' + (name ? ' — ' + name : '') + ' — وجّهها نحو البطاقات تباعاً دون توقف';
      }
      this._syncCameraButtons();
    } catch (err) {
      console.warn('[QRScanner] تعذر تشغيل الكاميرا:', err);
      this.isCameraRunning = false;
      if (startBtn) startBtn.style.display = 'inline-flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (statusText) statusText.textContent = 'تعذر الوصول للكاميرا — تحقق من الصلاحية';
      UI.showToast('تعذر فتح الكاميرا (تحقق من صلاحية الكاميرا في المتصفح)', 'warning', 3000);
      this._syncCameraButtons();
    } finally {
      this.isStarting = false;
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
    if (statusText) statusText.textContent = 'الكاميرا متوقفة';
    this._syncCameraButtons();
  },

  /* ===== معالجة كل بطاقة: تسجيل حضور فقط (النقاط تُطبّق عند الإنهاء) ===== */
  handleScannedCode(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return;

    // مهلة ثانيتين لنفس الكود حتى لا يتكرر الصوت والإشعار والكاميرا ما زالت على البطاقة
    const now = Date.now();
    if (this.lastScanned.code === code && now - this.lastScanned.timestamp < this.cooldownMs) return;
    this.lastScanned = { code, timestamp: now };

    const student = DB.getStudentById(code);
    if (!student) {
      UI.showToast(`الكود (${code}) غير مسجل لأي طالب!`, 'error', 2000);
      return;
    }
      if (this.presentIds.includes(student.id)) {
      if (now - (this._lastDupToast || 0) > 6000) {
        this._lastDupToast = now;
        UI.showToast(`${student.name} مسجل حاضراً مسبقاً`, 'warning', 2000);
      }
      return;
    }

    this.presentIds.push(student.id);
    this.playBeepSound();
    this.renderSessionPanel();

    const circleSel = document.getElementById('qr-circle');
    const otherCircle = circleSel && circleSel.value && circleSel.value !== student.circleId;
    UI.showToast(
      `[${student.id}] ${student.name} ✔ حاضر${otherCircle ? ' (من حلقة أخرى)' : ''}`,
      otherCircle ? 'warning' : 'success',
      2000
    );
  },

  /* ===== صوت بيب (1500Hz لمدة 100ms) ===== */
  ensureAudioContext() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!this.audioCtx) this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return this.audioCtx;
    } catch (e) {
      return null;
    }
  },

  playBeepSound() {
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1500, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (err) {
      console.warn('[QRScanner] تعذر تشغيل نغمة Beep:', err);
    }
  }
};

window.QRScanner = QRScanner;
document.addEventListener('DOMContentLoaded', () => {
  QRScanner.init();
});