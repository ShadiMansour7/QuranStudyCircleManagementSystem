/**
 * استوديو تصميم البطاقات وتصدير ملف PDF للطباعة المزدوجة (cards-pdf.js) - شباب مسجد قطنا
 * يدير:
 * 1. رفع صور خلفية الوجه الأمامي والوجه الخلفي للبطاقة ومعاينتها حياً على Canvas.
 * 2. التحكم الكامل بإحداثيات (X, Y) وحجم ولون كل من: اسم الطالب، العمر، ورمز الـ QR (يحوي الـ ID فقط) على الوجه الأمامي.
 * 3. التحكم بإحداثيات وحجم ولون ونص اسم المسجد الثابت على الوجه الخلفي لجميع البطاقات.
 * 4. اختيار الطلاب (تحديد الكل / إلغاء الكل / طلاب محددين / تصفية حسب الحلقة).
 * 5. تصدير ملف PDF للطباعة المزدوجة (Duplex):
 *    - مقاس البطاقة: العرض = 74.25mm (ربع طول A4)، الطول = 105mm (نصف عرض A4).
 *    - الترتيب: 8 بطاقات في كل صفحة A4 بوضع أفقي (Landscape 297mm × 210mm) في شبكة (4 أعمدة × صفين) أو عمودي متطابق،
 *      مع تناوب صفحة وجه أمامي (8 بطاقات) تليها صفحة وجه خلفي (8 بطاقات).
 */

const CardsPDF = {
  // أبعاد الـ Canvas الأساسي للمعاينة (نسبة الأبعاد مطابقة لـ 74.25mm × 105mm أي ~ 1 : 1.414)
  BASE_WIDTH: 310,
  BASE_HEIGHT: 440,

  // معامل تكبير الدقة عند التصدير للطباعة للحصول على جودة طباعة فائقة الوضوح (300+ DPI)
  EXPORT_SCALE: 3,

  state: {
    previewStudentId: '',
    selectedCircleId: 'ALL',
    selectedStudentIds: new Set(),
    frontBgImage: null,
    backBgImage: null
  },

  init() {
    this.mountStudioExtras();
    this.loadSavedDesignIntoInputs();
    this.syncStudioControls();
    this.bindEvents();
    this.refreshAll();
    this.loadFonts();
  },

  /**
   * تحديث قوائم الحلقات والطلاب والمعاينة الحية على الـ Canvas
   */
  refreshAll() {
    this.loadSavedDesignIntoInputs();
    this.syncStudioControls();
    this.populateCircleFilter();
    this.populatePreviewStudentSelect();
    this.renderStudentsChecklist();
    this.renderLivePreview();
  },

  /* ========================================================================
     1. قراءة وحفظ إعدادات التصميم والإحداثيات من وإلى قاعدة البيانات
     ======================================================================== */

  getDefaultDesign(orientation) {
    if ((orientation || this.getOrientation()) === 'landscape') {
      // بطاقة عرضية 440×310
      return {
        front: { nameX: 220, nameY: 100, nameSize: 22, nameColor: '#0f172a', ageX: 220, ageY: 135, ageSize: 16, ageColor: '#334155', qrX: 160, qrY: 165, qrSize: 125 },
        back: { mosqueName: 'شباب مسجد قطنا', mosqueX: 220, mosqueY: 160, mosqueSize: 28, mosqueColor: '#059669' }
      };
    }
    // بطاقة طولية 310×440
    return {
      front: { nameX: 155, nameY: 160, nameSize: 22, nameColor: '#0f172a', ageX: 155, ageY: 200, ageSize: 16, ageColor: '#334155', qrX: 80, qrY: 235, qrSize: 150 },
      back: { mosqueName: 'شباب مسجد قطنا', mosqueX: 155, mosqueY: 220, mosqueSize: 24, mosqueColor: '#059669' }
    };
  },

  loadSavedDesignIntoInputs() {
    this.flushDesignSave(); // لا نكتب فوق تعديل لم يُحفظ بعد
    this._orientation = this.getStudio().orientation;
    this.syncInputRanges();
    const { front, back } = this.getActiveLayout();

    this._setInputValue('cfg-name-x', front.nameX);
    this._setInputValue('cfg-name-y', front.nameY);
    this._setInputValue('cfg-name-size', front.nameSize);
    this._setInputValue('cfg-name-color', front.nameColor);

    this._setInputValue('cfg-age-x', front.ageX);
    this._setInputValue('cfg-age-y', front.ageY);
    this._setInputValue('cfg-age-size', front.ageSize);
    this._setInputValue('cfg-age-color', front.ageColor);

    this._setInputValue('cfg-qr-x', front.qrX);
    this._setInputValue('cfg-qr-y', front.qrY);
    this._setInputValue('cfg-qr-size', front.qrSize);

    this._setInputValue('cfg-mosque-text', back.mosqueName);
    this._setInputValue('cfg-mosque-x', back.mosqueX);
    this._setInputValue('cfg-mosque-y', back.mosqueY);
    this._setInputValue('cfg-mosque-size', back.mosqueSize);
    this._setInputValue('cfg-mosque-color', back.mosqueColor);
  },

  _setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) {
      el.value = val;
    }
  },

  readCurrentConfigFromInputs() {
    const front = {
      nameX: Number(document.getElementById('cfg-name-x')?.value ?? 155),
      nameY: Number(document.getElementById('cfg-name-y')?.value ?? 160),
      nameSize: Number(document.getElementById('cfg-name-size')?.value ?? 22),
      nameColor: document.getElementById('cfg-name-color')?.value || '#0f172a',

      ageX: Number(document.getElementById('cfg-age-x')?.value ?? 155),
      ageY: Number(document.getElementById('cfg-age-y')?.value ?? 200),
      ageSize: Number(document.getElementById('cfg-age-size')?.value ?? 16),
      ageColor: document.getElementById('cfg-age-color')?.value || '#334155',

      qrX: Number(document.getElementById('cfg-qr-x')?.value ?? 80),
      qrY: Number(document.getElementById('cfg-qr-y')?.value ?? 235),
      qrSize: Number(document.getElementById('cfg-qr-size')?.value ?? 150)
    };

    const back = {
      mosqueName: document.getElementById('cfg-mosque-text')?.value || 'شباب مسجد قطنا',
      mosqueX: Number(document.getElementById('cfg-mosque-x')?.value ?? 155),
      mosqueY: Number(document.getElementById('cfg-mosque-y')?.value ?? 220),
      mosqueSize: Number(document.getElementById('cfg-mosque-size')?.value ?? 24),
      mosqueColor: document.getElementById('cfg-mosque-color')?.value || '#059669'
    };

    return { front, back };
  },

  saveCurrentConfigToDB() {
    const { front, back } = this.readCurrentConfigFromInputs();
    const studio = this.getStudio();
    studio.layouts[studio.orientation] = { front, back };
    this.saveStudio(studio);
  },

  // حفظ مؤجَّل (400ms بعد آخر حركة) كي لا تُكتب القاعدة كلها مع كل نبضة سلايدر
  _saveTimer: null,

  scheduleDesignSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._safeSaveDesign();
    }, 400);
  },

  flushDesignSave() {
    if (this._saveTimer === null) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this._safeSaveDesign();
  },

  cancelDesignSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
  },

  _safeSaveDesign() {
    try {
      this.saveCurrentConfigToDB();
    } catch (err) {
      UI.showToast(err.message || 'تعذر حفظ تصميم البطاقة', 'error', 3500);
    }
  },

  /* ========================================================================
     2. ربط الأحداث لأدوات التصميم، رفع الصور، وتحديد الطلاب
     ======================================================================== */

  bindEvents() {
    // لا نفقد تعديلاً مؤجَّلاً عند إخفاء الصفحة أو إغلاقها
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flushDesignSave();
    });
    window.addEventListener('pagehide', () => this.flushDesignSave());

    // مراقبة جميع حقول التحكم بالإحداثيات والأحجام والألوان لتحديث الـ Canvas فوراً
    const controlIds = [
      'cfg-name-x',
      'cfg-name-y',
      'cfg-name-size',
      'cfg-name-color',
      'cfg-age-x',
      'cfg-age-y',
      'cfg-age-size',
      'cfg-age-color',
      'cfg-qr-x',
      'cfg-qr-y',
      'cfg-qr-size',
      'cfg-mosque-text',
      'cfg-mosque-x',
      'cfg-mosque-y',
      'cfg-mosque-size',
      'cfg-mosque-color'
    ];

    controlIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.scheduleDesignSave(); // الحفظ مؤجَّل؛ المعاينة فورية لأنها تقرأ من الحقول مباشرة
          this.renderLivePreview();
        });
      }
    });

    // زر استعادة الإحداثيات الافتراضية
    const resetBtn = document.getElementById('btn-reset-card-design');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.cancelDesignSave();
        const defaults = this.getDefaultDesign();
        const studio = this.getStudio();
        studio.layouts[studio.orientation] = { front: defaults.front, back: defaults.back };
        this.saveStudio(studio);
        this.loadSavedDesignIntoInputs();
        this.renderLivePreview();
        UI.showToast('تمت استعادة الإحداثيات والتصميم الافتراضي للبطاقة', 'success');
      });
    }

    // رفع صورة خلفية الوجه الأمامي
    const frontBgInput = document.getElementById('card-front-bg-input');
    if (frontBgInput) {
      frontBgInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        this.loadImageFile(file, (img) => {
          this.state.frontBgImage = img;
          this.persistBackground('front', img);
          this.renderLivePreview();
          UI.showToast('تم تحميل خلفية الوجه الأمامي بنجاح', 'success');
        });
      });
    }

    // مسح خلفية الوجه الأمامي
    const clearFrontBtn = document.getElementById('btn-clear-front-bg');
    if (clearFrontBtn) {
      clearFrontBtn.addEventListener('click', () => {
        this.state.frontBgImage = null;
        this.persistBackground('front', null);
        const input = document.getElementById('card-front-bg-input');
        if (input) input.value = '';
        this.renderLivePreview();
      });
    }

    // رفع صورة خلفية الوجه الخلفي
    const backBgInput = document.getElementById('card-back-bg-input');
    if (backBgInput) {
      backBgInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        this.loadImageFile(file, (img) => {
          this.state.backBgImage = img;
          this.persistBackground('back', img);
          this.renderLivePreview();
          UI.showToast('تم تحميل خلفية الوجه الخلفي بنجاح', 'success');
        });
      });
    }

    // مسح خلفية الوجه الخلفي
    const clearBackBtn = document.getElementById('btn-clear-back-bg');
    if (clearBackBtn) {
      clearBackBtn.addEventListener('click', () => {
        this.state.backBgImage = null;
        this.persistBackground('back', null);
        const input = document.getElementById('card-back-bg-input');
        if (input) input.value = '';
        this.renderLivePreview();
      });
    }

    // تغيير الطالب المختار للمعاينة الحية
    const previewSelect = document.getElementById('card-preview-student-select');
    if (previewSelect) {
      previewSelect.addEventListener('change', (e) => {
        this.state.previewStudentId = e.target.value;
        this.renderLivePreview();
      });
    }

    // فلترة قائمة اختيار الطلاب حسب الحلقة
    const circleFilter = document.getElementById('cards-circle-filter');
    if (circleFilter) {
      circleFilter.addEventListener('change', (e) => {
        this.state.selectedCircleId = e.target.value;
        this.renderStudentsChecklist();
      });
    }

    // زر تحديد جميع الطلاب المعروضين
    const selectAllBtn = document.getElementById('btn-cards-select-all');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const visibleStudents = DB.getStudents({
          circleId: this.state.selectedCircleId,
          sortAlphabetically: true
        });
        visibleStudents.forEach((st) => this.state.selectedStudentIds.add(st.id));
        this.renderStudentsChecklist();
      });
    }

    // زر إلغاء تحديد جميع الطلاب المعروضين
    const deselectAllBtn = document.getElementById('btn-cards-deselect-all');
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        const visibleStudents = DB.getStudents({
          circleId: this.state.selectedCircleId,
          sortAlphabetically: true
        });
        visibleStudents.forEach((st) => this.state.selectedStudentIds.delete(st.id));
        this.renderStudentsChecklist();
      });
    }

    // زر تصدير البطاقات المحددة كملف PDF للطباعة المزدوجة (Duplex)
    const exportPdfBtn = document.getElementById('btn-export-cards-pdf');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', () => {
        this.flushDesignSave();
        this.exportSelectedCardsToDuplexPDF();
      });
    }
  },

  /* ========================================================================
     استوديو البطاقات: الاتجاه (طولي/عرضي) + الخطوط + حفظ الخلفيات
     ======================================================================== */

  FONTS: [
    { id: 'system', label: 'خط النظام (افتراضي)', family: '' },
    { id: 'tajawal', label: 'Tajawal', family: 'Tajawal', files: { 400: 'libs/fonts/Tajawal-Regular.woff2', 700: 'libs/fonts/Tajawal-Bold.woff2' } },
    { id: 'cairo', label: 'Cairo', family: 'Cairo', files: { 400: 'libs/fonts/Cairo-Regular.woff2', 700: 'libs/fonts/Cairo-Bold.woff2' } },
    { id: 'amiri', label: 'Amiri (نسخ تقليدي)', family: 'Amiri', files: { 400: 'libs/fonts/Amiri-Regular.woff2', 700: 'libs/fonts/Amiri-Bold.woff2' } }
  ],
  BG_KEY: 'qatana_card_bgs_v1', // الخلفيات خارج قاعدة البيانات الرئيسية كي لا تتضخم النسخ الاحتياطية
  _fontReady: {},
  _fontCss: '',
  _orientation: '',
  _bgLoadedFor: '',

  // حالة الاستوديو (الاتجاه والخط وتصميم كل اتجاه) محفوظة ضمن إعدادات DB فتدخل النسخ الاحتياطية
  getStudio() {
    const s = (DB.getSettings() || {}).cardStudio || {};
    return {
      orientation: s.orientation === 'landscape' ? 'landscape' : 'portrait',
      fontId: s.fontId || 'tajawal',
      layouts: s.layouts || {}
    };
  },

  saveStudio(studio) {
    DB.updateSettings({ cardStudio: studio });
  },

  getOrientation() {
    return this._orientation || this.getStudio().orientation;
  },

  getDims() {
    return this.getOrientation() === 'landscape' ? { w: 440, h: 310 } : { w: 310, h: 440 };
  },

  // التصميم الفعّال للاتجاه الحالي (التصميم القديم المحفوظ يُستخدم كتصميم الاتجاه الطولي)
  getActiveLayout() {
    const studio = this.getStudio();
    const def = this.getDefaultDesign(studio.orientation);
    let saved = studio.layouts[studio.orientation];
    if (!saved && studio.orientation === 'portrait') saved = DB.getCardDesign();
    return {
      front: { ...def.front, ...((saved && saved.front) || {}) },
      back: { ...def.back, ...((saved && saved.back) || {}) }
    };
  },

  // إضافة خانة الاتجاه وقائمة الخطوط بجانب زر استعادة التصميم
  mountStudioExtras() {
    const resetBtn = document.getElementById('btn-reset-card-design');
    if (!resetBtn || document.getElementById('cfg-card-landscape')) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin:.5rem 0;';
    wrap.innerHTML = `
      <label style="display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;font-weight:700;">
        <input type="checkbox" id="cfg-card-landscape"> بطاقة عرضية (105×74.25 مم)
      </label>
      <label style="display:inline-flex;align-items:center;gap:.4rem;">الخط
        <select id="cfg-card-font" class="form-control" style="width:auto;"></select>
      </label>
      <small id="cfg-font-hint" style="color:var(--text-muted);"></small>`;
    resetBtn.parentNode.insertBefore(wrap, resetBtn);
    document.getElementById('cfg-card-landscape').addEventListener('change', (e) =>
      this.applyOrientation(e.target.checked ? 'landscape' : 'portrait')
    );
    document.getElementById('cfg-card-font').addEventListener('change', (e) => this.applyFont(e.target.value));
  },

  // مزامنة الخانة والخط وحدود الإحداثيات والخلفيات مع الاتجاه المحفوظ
  syncStudioControls() {
    const studio = this.getStudio();
    this._orientation = studio.orientation;
    const cb = document.getElementById('cfg-card-landscape');
    if (cb) cb.checked = studio.orientation === 'landscape';
    this.fillFontSelect();
    this._updateFontCss();
    this.syncInputRanges();
    this.loadBackgrounds();
  },

  syncInputRanges() {
    const { w, h } = this.getDims();
    ['name', 'age', 'qr', 'mosque'].forEach((k) => {
      const x = document.getElementById(`cfg-${k}-x`);
      const y = document.getElementById(`cfg-${k}-y`);
      if (x) x.max = w;
      if (y) y.max = h;
    });
  },

  applyOrientation(orientation) {
    this.flushDesignSave(); // تعديلات الاتجاه الحالي تُحفظ قبل التحويل
    const studio = this.getStudio();
    studio.orientation = orientation;
    this.saveStudio(studio);
    this._orientation = orientation;
    this.loadSavedDesignIntoInputs();
    this.syncInputRanges();
    this.loadBackgrounds();
    this.renderLivePreview();
    UI.showToast(orientation === 'landscape' ? 'تم التحويل إلى البطاقة العرضية' : 'تم التحويل إلى البطاقة الطولية', 'success');
  },

  // تحميل الخطوط المحلية (libs/fonts) وإظهار المتوفر منها فقط
  async loadFonts() {
    for (const f of this.FONTS) {
      if (!f.files) continue;
      const results = await Promise.allSettled(
        Object.entries(f.files).map(([weight, url]) => new FontFace(f.family, `url(${url})`, { weight: String(weight) }).load())
      );
      const ok = results.filter((r) => r.status === 'fulfilled');
      ok.forEach((r) => document.fonts.add(r.value));
      this._fontReady[f.id] = ok.length > 0;
    }
    this.fillFontSelect();
    this._updateFontCss();
    this.renderLivePreview();
  },

  fillFontSelect() {
    const sel = document.getElementById('cfg-card-font');
    if (!sel) return;
    const available = this.FONTS.filter((f) => f.id === 'system' || this._fontReady[f.id]);
    const current = this.getStudio().fontId;
    sel.innerHTML = available.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');
    sel.value = available.some((f) => f.id === current) ? current : 'system';
    const hint = document.getElementById('cfg-font-hint');
    if (hint) hint.textContent = available.length === 1 ? 'ضع ملفات الخطوط (woff2) في libs/fonts لتظهر هنا' : '';
  },

  applyFont(fontId) {
    this.flushDesignSave();
    const studio = this.getStudio();
    studio.fontId = fontId;
    this.saveStudio(studio);
    this._updateFontCss();
    this.renderLivePreview();
  },

  _updateFontCss() {
    const f = this.FONTS.find((x) => x.id === this.getStudio().fontId);
    this._fontCss = f && f.family && this._fontReady[f.id] ? `"${f.family}", ` : '';
  },

  // سلسلة الخط المستخدمة في رسم الكانفاس (الخط المختار ثم بدائل آمنة)
  fontStack() {
    return `${this._fontCss}"Tajawal", "Cairo", "Segoe UI", Tahoma, sans-serif`;
  },

  // خلفيات البطاقات: صورة لكل (اتجاه × وجه)، تُصغَّر وتُحفظ JPEG محلياً
  _readBgStore() {
    try {
      return JSON.parse(localStorage.getItem(this.BG_KEY)) || {};
    } catch (e) {
      return {};
    }
  },

  loadBackgrounds() {
    const o = this.getOrientation();
    if (this._bgLoadedFor === o) return; // الصور محمّلة أصلاً لهذا الاتجاه
    this._bgLoadedFor = o;
    const saved = this._readBgStore()[o] || {};
    ['front', 'back'].forEach((side) => {
      this.state[`${side}BgImage`] = null;
      if (!saved[side]) return;
      const img = new Image();
      img.onload = () => {
        this.state[`${side}BgImage`] = img;
        this.renderLivePreview();
      };
      img.src = saved[side];
    });
  },

  persistBackground(side, img) {
    const o = this.getOrientation();
    const store = this._readBgStore();
    store[o] = store[o] || {};
    if (!img) {
      delete store[o][side];
    } else {
      const k = Math.min(1, 1300 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      store[o][side] = c.toDataURL('image/jpeg', 0.85);
    }
    try {
      localStorage.setItem(this.BG_KEY, JSON.stringify(store));
    } catch (e) {
      UI.showToast('الصورة كبيرة ولم تُحفظ للجلسات القادمة (ستعمل حتى تحديث الصفحة)', 'warning', 3500);
    }
  },

  loadImageFile(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => callback(img);
      img.onerror = () => UI.showToast('تعذر قراءة ملف الصورة المرفوع', 'error');
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  /* ========================================================================
     3. قوائم اختيار الطلاب للمعاينة والطباعة
     ======================================================================== */

  populateCircleFilter() {
    const select = document.getElementById('cards-circle-filter');
    if (!select) return;

    const circles = DB.getCircles();
    const currentVal = this.state.selectedCircleId;

    select.innerHTML = '<option value="ALL">عرض طلاب جميع الحلقات</option>';
    circles.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    });

    if (currentVal !== 'ALL' && circles.some((c) => c.id === currentVal)) {
      select.value = currentVal;
    } else {
      this.state.selectedCircleId = 'ALL';
      select.value = 'ALL';
    }
  },

  populatePreviewStudentSelect() {
    const select = document.getElementById('card-preview-student-select');
    if (!select) return;

    const students = DB.getStudents({ circleId: 'ALL', sortAlphabetically: true });
    const currentVal = this.state.previewStudentId;

    select.innerHTML = '<option value="">-- معاينة تجريبية افتراضية --</option>';
    students.forEach((st) => {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = `${st.name} (${st.id})`;
      select.appendChild(opt);
    });

    if (currentVal && students.some((s) => s.id === currentVal)) {
      select.value = currentVal;
    } else if (students.length > 0) {
      this.state.previewStudentId = students[0].id;
      select.value = students[0].id;
    } else {
      this.state.previewStudentId = '';
    }
  },

  renderStudentsChecklist() {
    const container = document.getElementById('cards-students-checklist');
    if (!container) return;

    const allStudentsIds = new Set(DB.getStudents({ circleId: 'ALL' }).map((s) => s.id));
    // تنظيف المعرّفات المحذوفة
    Array.from(this.state.selectedStudentIds).forEach((id) => {
      if (!allStudentsIds.has(id)) {
        this.state.selectedStudentIds.delete(id);
      }
    });

    const visibleStudents = DB.getStudents({
      circleId: this.state.selectedCircleId,
      sortAlphabetically: true
    });

    container.innerHTML = '';

    if (visibleStudents.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 1.2rem; color: var(--text-secondary);">
          لا يوجد طلاب مسجلون في هذه الحلقة حالياً.
        </div>
      `;
      this.updateSelectedCountLabel();
      return;
    }

    // إذا لم يكن هناك أي طالب محدد عند أول فتح، قم بتحديد الطلاب تلقائياً للتسهيل
    if (this.state.selectedStudentIds.size === 0 && !this._initialSelectionDone) {
      visibleStudents.forEach((st) => this.state.selectedStudentIds.add(st.id));
      this._initialSelectionDone = true;
    }

    visibleStudents.forEach((student) => {
      const label = document.createElement('label');
      label.className = 'checkbox-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = student.id;
      checkbox.checked = this.state.selectedStudentIds.has(student.id);

      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.state.selectedStudentIds.add(student.id);
        } else {
          this.state.selectedStudentIds.delete(student.id);
        }
        this.updateSelectedCountLabel();
      });

      const span = document.createElement('span');
      span.textContent = `${student.name} (${student.id})`;

      label.appendChild(checkbox);
      label.appendChild(span);
      container.appendChild(label);
    });

    this.updateSelectedCountLabel();
  },

  updateSelectedCountLabel() {
    const label = document.getElementById('cards-selected-count-label');
    if (label) {
      label.textContent = `عدد الطلاب المحددين للطباعة: ${this.state.selectedStudentIds.size}`;
    }
  },

  /* ========================================================================
     4. رسم البطاقة الأمامية والخلفية على الـ Canvas وتوليد رمز الـ QR (QRious)
     ======================================================================== */

  getPreviewStudentObject() {
    if (this.state.previewStudentId) {
      const found = DB.getStudentById(this.state.previewStudentId);
      if (found) return found;
    }
    return {
      id: 'QAT-1001',
      name: 'عبد الرحمن أحمد المنصور',
      age: 12
    };
  },

  renderLivePreview() {
    const frontCanvas = document.getElementById('card-front-canvas');
    const backCanvas = document.getElementById('card-back-canvas');
    if (!frontCanvas || !backCanvas) return;

    const config = this.readCurrentConfigFromInputs();
    const previewStudent = this.getPreviewStudentObject();

    this.drawFrontCardOnCanvas(frontCanvas, previewStudent, config.front, 1);
    this.drawBackCardOnCanvas(backCanvas, config.back, 1);
  },

  /**
   * رسم الوجه الأمامي للبطاقة على أي Canvas مع دعم معامل التكبير (scale)
   */
  drawFrontCardOnCanvas(canvas, student, frontCfg, scale = 1) {
    const width = this.getDims().w * scale;
    const height = this.getDims().h * scale;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.save();

    // 1. رسم الخلفية (صورة مرفوعة أو تصميم إسلامي أخضر أنيق افتراضي)
    if (this.state.frontBgImage) {
      ctx.drawImage(this.state.frontBgImage, 0, 0, width, height);
    } else {
      this._drawDefaultCardTemplate(ctx, width, height, scale, true);
    }

    // 2. رسم اسم الطالب في الإحداثيات المحددة
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = frontCfg.nameColor || '#0f172a';
    ctx.font = `bold ${Math.round(frontCfg.nameSize * scale)}px ${this.fontStack()}`;
    ctx.fillText(student.name || '', frontCfg.nameX * scale, frontCfg.nameY * scale);

    // 3. رسم عمر الطالب في الإحداثيات المحددة
    ctx.fillStyle = frontCfg.ageColor || '#334155';
    ctx.font = `600 ${Math.round(frontCfg.ageSize * scale)}px ${this.fontStack()}`;
    ctx.fillText(`العمر: ${student.age} سنة`, frontCfg.ageX * scale, frontCfg.ageY * scale);

    // 4. توليد ورسم رمز الـ QR الذي يحتوي على المعرّف (ID) الخاص بالطالب فقط
    const qrSizeScaled = Math.round(frontCfg.qrSize * scale);
    const qrXScaled = Math.round(frontCfg.qrX * scale);
    const qrYScaled = Math.round(frontCfg.qrY * scale);

    const qrCanvas = this._createQrCanvas(student.id, qrSizeScaled);
    if (qrCanvas) {
      // إطار أبيض خفيف حول الـ QR لضمان سهولة القراءة الضوئية حتى فوق الخلفيات الداكنة
      const pad = Math.round(6 * scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(
        qrXScaled - pad,
        qrYScaled - pad,
        qrSizeScaled + pad * 2,
        qrSizeScaled + pad * 2
      );
      ctx.strokeStyle = 'rgba(5, 150, 105, 0.35)';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
      ctx.strokeRect(
        qrXScaled - pad,
        qrYScaled - pad,
        qrSizeScaled + pad * 2,
        qrSizeScaled + pad * 2
      );

      ctx.drawImage(qrCanvas, qrXScaled, qrYScaled, qrSizeScaled, qrSizeScaled);
    }

    // 5. كتابة رمز المعرّف (ID) بخط صغير أسفل الـ QR مباشرة للرجوع اليدوي عند الحاجة
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = `bold ${Math.round(11 * scale)}px monospace`;
    ctx.fillText(
      student.id,
      qrXScaled + qrSizeScaled / 2,
      qrYScaled + qrSizeScaled + Math.round(14 * scale)
    );

    ctx.restore();
  },

  /**
   * رسم الوجه الخلفي الثابت للبطاقة على أي Canvas مع دعم معامل التكبير (scale)
   */
  drawBackCardOnCanvas(canvas, backCfg, scale = 1) {
    const width = this.getDims().w * scale;
    const height = this.getDims().h * scale;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.save();

    // 1. رسم الخلفية (صورة مرفوعة أو تصميم افتراضي متناسق)
    if (this.state.backBgImage) {
      ctx.drawImage(this.state.backBgImage, 0, 0, width, height);
    } else {
      this._drawDefaultCardTemplate(ctx, width, height, scale, false);
    }

    // 2. رسم اسم المسجد الثابت في الإحداثيات المحددة
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = backCfg.mosqueColor || '#059669';
    ctx.font = `800 ${Math.round(backCfg.mosqueSize * scale)}px ${this.fontStack()}`;
    ctx.fillText(
      backCfg.mosqueName || 'شباب مسجد قطنا',
      backCfg.mosqueX * scale,
      backCfg.mosqueY * scale
    );

    ctx.restore();
  },

  /**
   * تصميم افتراضي أنيق باللون الأخضر الزمردي في حال لم يرفع المستخدم صورة خلفية خارجية
   */
  _drawDefaultCardTemplate(ctx, width, height, scale, isFront) {
    // خلفية البطاقة الأساسية
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // ترويسة علوية خضراء زمردية
    const headerHeight = Math.round((isFront ? 92 : 115) * scale);
    const grad = ctx.createLinearGradient(0, 0, width, headerHeight);
    grad.addColorStop(0, '#059669');
    grad.addColorStop(1, '#047857');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, headerHeight);

    // شريط ذهبي رفيع أسفل الترويسة
    ctx.fillStyle = '#eab308';
    ctx.fillRect(0, headerHeight, width, Math.round(4 * scale));

    // إطار داخلي للبطاقة
    const borderPad = Math.round(10 * scale);
    ctx.strokeStyle = 'rgba(5, 150, 105, 0.35)';
    ctx.lineWidth = Math.max(1, Math.round(2 * scale));
    ctx.strokeRect(borderPad, borderPad, width - borderPad * 2, height - borderPad * 2);

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';

    if (isFront) {
      ctx.font = `bold ${Math.round(16 * scale)}px ${this.fontStack()}`;
      ctx.fillText('بطاقة طالب حلقة قرآنية', width / 2, Math.round(38 * scale));
      ctx.font = `600 ${Math.round(13 * scale)}px ${this.fontStack()}`;
      ctx.fillStyle = '#d1fae5';
      ctx.fillText('شباب مسجد قطنا', width / 2, Math.round(66 * scale));
    } else {
      ctx.font = `bold ${Math.round(17 * scale)}px ${this.fontStack()}`;
      ctx.fillText('إدارة الحلقات القرآنية', width / 2, Math.round(50 * scale));
      ctx.font = `600 ${Math.round(13 * scale)}px ${this.fontStack()}`;
      ctx.fillStyle = '#d1fae5';
      ctx.fillText('﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾', width / 2, Math.round(82 * scale));

      // زخرفة سفلية هادئة للوجه الخلفي
      ctx.fillStyle = '#64748b';
      ctx.font = `600 ${Math.round(12 * scale)}px ${this.fontStack()}`;
      ctx.fillText('يرجى إحضار البطاقة في كل جلسة لتسجيل النقاط', width / 2, height - Math.round(34 * scale));
    }
  },

  /**
   * توليد عنصر Canvas يحتوي على رمز الـ QR لمعرّف الطالب فقط عبر مكتبة QRious
   */
  _createQrCanvas(studentIdText, sizePx) {
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = sizePx;
    qrCanvas.height = sizePx;

    if (typeof QRious !== 'undefined') {
      new QRious({
        element: qrCanvas,
        value: String(studentIdText || 'QAT-1001').trim(),
        size: sizePx,
        level: 'H',
        background: '#ffffff',
        foreground: '#000000',
        padding: 0
      });
      return qrCanvas;
    }

    // رسم بديل توضيحي فقط في حال لم يقم المستخدم بوضع ملف libs/qrious.min.js بعد
    const ctx = qrCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, sizePx - 4, sizePx - 4);
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${Math.round(sizePx * 0.12)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(String(studentIdText), sizePx / 2, sizePx / 2);
    return qrCanvas;
  },

  /* ========================================================================
     5. تصدير ملف PDF للطباعة المزدوجة (Duplex) - 8 بطاقات في كل صفحة A4
     ======================================================================== */

  /**
   * تفاصيل الهندسة الطباعية للورقة (A4):
   * - أبعاد ورقة A4 القياسية: 297mm × 210mm.
   * - مقاس البطاقة المطلوب حرفياً:
   *   العرض = ربع طول ورقة A4 = 297 / 4 = 74.25mm
   *   الطول = نصف عرض ورقة A4 = 210 / 2 = 105mm
   * - بوضع الصفحة أفقياً (Landscape A4: عرض 297mm × ارتفاع 210mm):
   *   تترتب 4 أعمدة أفقية (4 × 74.25mm = 297mm) × صفين عموديين (2 × 105mm = 210mm) = 8 بطاقات كاملة في الصفحة بدون أي هدر،
   *   أو بوضع الصفحة عمودياً مع دوران البطاقة (شبكة عمودين × 4 صفوف).
   * - التناوب للطباعة المزدوجة (Duplex):
   *   لكل دفعة مكونة من 8 طلاب:
   *   1. الصفحة الفردية (1, 3, 5...): الوجه الأمامي لـ 8 بطاقات.
   *   2. الصفحة الزوجية (2, 4, 6...): الوجه الخلفي الثابت لـ 8 بطاقات مقابلة لها تماماً على ظهر الورقة.
   */
  exportSelectedCardsToDuplexPDF() {
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      UI.showToast('تأكد من وجود ملف المكتبة libs/jspdf.umd.min.js لتصدير ملف الـ PDF', 'error', 3500);
      return;
    }

    const allStudents = DB.getStudents({ circleId: 'ALL', sortAlphabetically: true });
    const selectedStudents = allStudents.filter((st) => this.state.selectedStudentIds.has(st.id));

    if (selectedStudents.length === 0) {
      UI.showToast('يرجى تحديد طالب واحد على الأقل لتصدير البطاقات', 'warning', 2800);
      return;
    }

    UI.showToast(`جاري تجهيز وتوليد بطاقات ${selectedStudents.length} طالب بصيغة PDF...`, 'success', 2200);

    try {
      const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;

      // إعداد ورقة A4 بوضع Landscape (عرض 297mm × ارتفاع 210mm)
      // بحيث تتسع البطاقة ذات العرض 74.25mm والطول 105mm لـ 8 بطاقات بالضبط في كل صفحة
      const landscapeCards = this.getOrientation() === 'landscape';
      const pageOrientation = landscapeCards ? 'portrait' : 'landscape';
      const doc = new jsPDFConstructor({
        orientation: pageOrientation,
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      // طولية: 74.25×105 على A4 أفقي (4×2) — عرضية: 105×74.25 على A4 طولي (2×4)
      const CARD_W_MM = landscapeCards ? 105.0 : 74.25;
      const CARD_H_MM = landscapeCards ? 74.25 : 105.0;
      const COLS = landscapeCards ? 2 : 4;
      const ROWS = landscapeCards ? 4 : 2;
      const CARDS_PER_PAGE = COLS * ROWS; // 8 بطاقات في كل صفحة A4

      const config = this.readCurrentConfigFromInputs();
      const tempFrontCanvas = document.createElement('canvas');
      const tempBackCanvas = document.createElement('canvas');

      // تجهيز صورة الوجه الخلفي الثابت مرة واحدة بدقة عالية لإعادة استخدامها بسرعة
      this.drawBackCardOnCanvas(tempBackCanvas, config.back, this.EXPORT_SCALE);
      const backCardDataUrl = tempBackCanvas.toDataURL('image/jpeg', 0.95);

      // تقسيم الطلاب المحددين إلى دفعات (Chunks) من 8 طلاب لكل صفحة
      const chunks = [];
      for (let i = 0; i < selectedStudents.length; i += CARDS_PER_PAGE) {
        chunks.push(selectedStudents.slice(i, i + CARDS_PER_PAGE));
      }

      chunks.forEach((studentChunk, chunkIndex) => {
        // إذا لم تكن الدفعة الأولى، أضف صفحة فردية جديدة للوجه الأمامي
        if (chunkIndex > 0) {
          doc.addPage('a4', pageOrientation);
        }

        // ------------------------------------------------------------------
        // أولاً: الصفحة الفردية — رسم الوجه الأمامي لـ 8 بطاقات (أو عدد طلاب الدفعة)
        // ------------------------------------------------------------------
        studentChunk.forEach((student, idxInPage) => {
          const col = idxInPage % COLS;
          const row = Math.floor(idxInPage / COLS);
          const xMm = col * CARD_W_MM;
          const yMm = row * CARD_H_MM;

          this.drawFrontCardOnCanvas(tempFrontCanvas, student, config.front, this.EXPORT_SCALE);
          const frontCardDataUrl = tempFrontCanvas.toDataURL('image/jpeg', 0.95);

          doc.addImage(frontCardDataUrl, 'JPEG', xMm, yMm, CARD_W_MM, CARD_H_MM);

          // رسم خطوط قص رفيعة جداً حول البطاقة لتسهيل التقطيع بعد الطباعة
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.15);
          doc.rect(xMm, yMm, CARD_W_MM, CARD_H_MM);
        });

        // ------------------------------------------------------------------
        // ثانياً: الصفحة الزوجية التالية مباشرة — رسم الوجه الخلفي الثابت (Duplex)
        // ملاحظة هندسية للطباعة على الوجهين (Duplex Flip):
        // يتم عكس ترتيب الأعمدة أفقياً (COLS - 1 - col) بحيث ينطبق ظهر كل بطاقة
        // خلف وجهها الأمامي تماماً حتى لو كان عدد البطاقات في الصفحة الأخيرة أقل من 8.
        // ------------------------------------------------------------------
        doc.addPage('a4', pageOrientation);

        studentChunk.forEach((_, idxInPage) => {
          const frontCol = idxInPage % COLS;
          const row = Math.floor(idxInPage / COLS);
          const mirroredCol = COLS - 1 - frontCol;

          const xMm = mirroredCol * CARD_W_MM;
          const yMm = row * CARD_H_MM;

          doc.addImage(backCardDataUrl, 'JPEG', xMm, yMm, CARD_W_MM, CARD_H_MM);

          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.15);
          doc.rect(xMm, yMm, CARD_W_MM, CARD_H_MM);
        });
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`بطاقات_طلاب_مسجد_قطنا_Duplex_${dateStr}.pdf`);

      UI.showToast(
        `تم تصدير ملف الـ PDF بنجاح (${chunks.length * 2} صفحة لطباعة ${selectedStudents.length} بطاقة مزدوجة)`,
        'success',
        3500
      );
    } catch (err) {
      console.error('[CardsPDF] خطأ أثناء تصدير ملف PDF:', err);
      UI.showToast(err.message || 'حدث خطأ أثناء توليد ملف الـ PDF', 'error', 3500);
    }
  }
};

window.CardsPDF = CardsPDF;
document.addEventListener('DOMContentLoaded', () => {
  CardsPDF.init();
});