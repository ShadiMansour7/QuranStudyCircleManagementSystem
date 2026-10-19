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

  /* ===== الكاميرا: قراءة مستمرة بدون إغلاق بعد كل بطاقة ===== */
  async startCamera() {
    if (this.isCameraRunning) return;
    const statusText = document.getElementById('qr-scanner-status-text');
    const startBtn = document.getElementById('btn-start-camera-scan');
    const stopBtn = document.getElementById('btn-stop-camera-scan');

    if (typeof Html5Qrcode === 'undefined') {
      if (statusText) statusText.textContent = 'مكتبة الكاميرا غير محملة';
      UI.showToast('تأكد من وجود ملف libs/html5-qrcode.min.js', 'warning', 3000);
      return;
    }

    try {
      this.ensureAudioContext();
      if (!this.html5QrCodeInstance) this.html5QrCodeInstance = new Html5Qrcode('qr-reader');
      await this.html5QrCodeInstance.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => this.handleScannedCode(decodedText),
        () => {} // تجاهل الإطارات الفارغة أثناء البحث المستمر
      );
      this.isCameraRunning = true;
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-flex';
      if (statusText) statusText.textContent = 'الكاميرا تعمل — وجّهها نحو البطاقات تباعاً دون توقف';
    } catch (err) {
      console.warn('[QRScanner] تعذر تشغيل الكاميرا:', err);
      this.isCameraRunning = false;
      if (startBtn) startBtn.style.display = 'inline-flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (statusText) statusText.textContent = 'تعذر الوصول للكاميرا — تحقق من الصلاحية';
      UI.showToast('تعذر فتح الكاميرا (تحقق من صلاحية الكاميرا في المتصفح)', 'warning', 3000);
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