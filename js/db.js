/**
 * إدارة قاعدة البيانات المحلية (localStorage) - شباب مسجد قطنا
 * يتولى تهيئة البيانات، الحلقات، الطلاب، سجل النقاط، الإعدادات، والنسخ الاحتياطي (TXT)
 */

const DB_STORAGE_KEY = 'QATANA_MOSQUE_QURAN_DB_V1';
// إصدار هيكل البيانات: 1 = نسخ قديمة بلا حقل إصدار، 2 = أول إصدار يحمل schemaVersion.
// ارفعه عند تغيير هيكل البيانات بطريقة تحتاج ترحيلاً داخل _mergeDefaults.
const DB_SCHEMA_VERSION = 2;
// الحد الأقصى لسجل نقاط الطالب: أحدث (MAX-1) قيود + قيد خامس واحد = مجموع القيود الأقدم
const MAX_POINTS_LOG_ENTRIES = 5;

const DEFAULT_DB_STATE = {
  lastStudentNumber: 1000,
  circles: [
    {
      id: 'CIRCLE-1',
      name: 'حلقة أبي بكر الصديق',
      prefix: 'QAT',
      createdAt: new Date().toISOString()
    }
  ],
  students: [],
  settings: {
    theme: 'emerald', // 'emerald' | 'forest' | 'olive' | 'sage' | 'mint' | 'moss' | 'pine' | 'mist'
    mode: 'light',    // 'light' | 'dark'
    mosqueName: 'شباب مسجد قطنا',
    cardDesign: {
      front: {
        nameX: 155,
        nameY: 160,
        nameSize: 22,
        nameColor: '#0f172a',
        ageX: 155,
        ageY: 200,
        ageSize: 16,
        ageColor: '#334155',
        qrX: 80,
        qrY: 235,
        qrSize: 150
      },
      back: {
        mosqueName: 'شباب مسجد قطنا',
        mosqueX: 155,
        mosqueY: 220,
        mosqueSize: 24,
        mosqueColor: '#059669'
      }
    }
  }
};

const DB = {
  // كاش بالذاكرة للبيانات بعد الدمج مع الافتراضيات. للقراءة فقط: لا تعدّل ما تُرجعه _peek()
  // (getCircles / getStudents / getStudentById). أما getData() فتُرجع نسخة مستقلة آمنة للتعديل.
  _cache: null,

  _clone(obj) {
    return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
  },

  /**
   * تهيئة قاعدة البيانات في localStorage عند التشغيل لأول مرة
   */
  init() {
    let raw = null;
    try {
      raw = localStorage.getItem(DB_STORAGE_KEY);
    } catch (err) {
      console.warn('تعذر الوصول إلى localStorage:', err);
    }
    if (!raw) return this._resetToDefaults();
    try {
      this._logsCompacted = false;
      const merged = this._mergeDefaults(JSON.parse(raw));
      this._cache = merged;
      // بيانات قديمة فيها سجلات أكثر من الحد: تُضغط مرة واحدة ويُحفظ الناتج (مع نسخة احتياطية أولاً)
      if (this._logsCompacted) this._persistCompactedLogs(raw, merged);
      return this._clone(this._cache);
    } catch (err) {
      console.error('خطأ في قراءة قاعدة البيانات، سيتم استعادة الهيكل الافتراضي:', err);
      // نحتفظ بنسخة من النص التالف (خانة واحدة) قبل الاستبدال كي لا تضيع البيانات نهائياً
      try {
        localStorage.setItem(DB_STORAGE_KEY + '_CORRUPT_BACKUP', raw);
      } catch (e) {
        /* تجاهل */
      }
      return this._resetToDefaults();
    }
  },

  /**
   * ترحيل لمرة واحدة: حفظ البيانات بعد ضغط سجلات النقاط. تُحفظ نسخة من النص الأصلي أولاً
   * (QATANA_MOSQUE_QURAN_DB_V1_PRECOMPACT_BACKUP) لأن الضغط يُفقد تفاصيل القيود القديمة.
   * إن تعذّر حفظ النسخة لا يُحفظ الضغط (يبقى في الذاكرة فقط وتُعاد المحاولة في التشغيل القادم).
   */
  _persistCompactedLogs(rawText, merged) {
    const backupKey = DB_STORAGE_KEY + '_PRECOMPACT_BACKUP';
    try {
      if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, rawText);
    } catch (e) {
      console.warn('تعذر حفظ النسخة الاحتياطية قبل ضغط السجلات؛ أُجّل الضغط:', e);
      return;
    }
    try {
      this.saveData(this._clone(merged));
    } catch (e) {
      console.warn('تعذر حفظ السجلات المضغوطة:', e);
    }
    this._cache = merged;
  },

  /**
   * ضغط سجل نقاط طالب (الأحدث أولاً): إن زاد على MAX_POINTS_LOG_ENTRIES يُبقى أحدث (MAX-1) قيود
   * وتُطوى البقية في قيد واحد مجمَّع { summary: true, change: المجموع, count: عدد المطوي }.
   * تُرجع المصفوفة نفسها إن لم يلزم تغيير (ليُعرف إن حدث ضغط).
   */
  _compactLog(log) {
    const normals = [];
    const sums = [];
    log.forEach((e) => {
      if (!e || typeof e !== 'object') return;
      (e.summary ? sums : normals).push(e);
    });
    const total = normals.length + (sums.length ? 1 : 0);
    if (total <= MAX_POINTS_LOG_ENTRIES && sums.length <= 1 && normals.length + sums.length === log.length) return log;

    const keepN = total > MAX_POINTS_LOG_ENTRIES ? MAX_POINTS_LOG_ENTRIES - 1 : normals.length;
    const keep = normals.slice(0, keepN);
    const folded = normals.slice(keepN);
    const change =
      sums.reduce((a, e) => a + (Number(e.change) || 0), 0) +
      folded.reduce((a, e) => a + (Number(e.change) || 0), 0);
    const count = sums.reduce((a, e) => a + (Number(e.count) || 0), 0) + folded.length;
    const summary = {
      id: (sums[0] && sums[0].id) || 'LOG-SUM-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
      change,
      operation: change >= 0 ? 'add' : 'deduct',
      reason: 'مجموع السجلات القديمة',
      timestamp: (folded[0] && folded[0].timestamp) || (sums[0] && sums[0].timestamp) || new Date().toISOString(),
      summary: true,
      count
    };
    return [...keep, summary];
  },

  /** إضافة قيد في أول سجل الطالب (الأحدث أولاً) ثم ضغط السجل إن لزم */
  _pushLog(student, entry) {
    if (!Array.isArray(student.pointsLog)) student.pointsLog = [];
    student.pointsLog.unshift(entry);
    student.pointsLog = this._compactLog(student.pointsLog);
  },

  _resetToDefaults() {
    const fresh = this._mergeDefaults(this._clone(DEFAULT_DB_STATE));
    try {
      this.saveData(fresh);
    } catch (err) {
      console.warn('تعذر حفظ البيانات الافتراضية:', err);
      this._cache = fresh; // يعمل التطبيق في الذاكرة فقط
    }
    return this._clone(fresh);
  },

  /**
   * ضمان وجود كافة الحقول الأساسية عند تحديث النسخ أو الاستيراد
   */
  _mergeDefaults(data) {
    const merged = {
      schemaVersion: DB_SCHEMA_VERSION,
      lastStudentNumber: typeof data.lastStudentNumber === 'number' ? data.lastStudentNumber : 1000,
      circles: Array.isArray(data.circles) ? data.circles : [],
      students: Array.isArray(data.students) ? data.students : [],
      settings: {
        ...DEFAULT_DB_STATE.settings,
        ...(data.settings || {}),
        cardDesign: {
          front: {
            ...DEFAULT_DB_STATE.settings.cardDesign.front,
            ...((data.settings && data.settings.cardDesign && data.settings.cardDesign.front) || {})
          },
          back: {
            ...DEFAULT_DB_STATE.settings.cardDesign.back,
            ...((data.settings && data.settings.cardDesign && data.settings.cardDesign.back) || {})
          }
        }
      }
    };

    // ضمان وجود رمز معرّف لكل حلقة (الحلقات القديمة تأخذ QAT)
    merged.circles = merged.circles.map((c) => ({
      ...c,
      prefix: this.normalizePrefix(c.prefix) || 'QAT'
    }));

    // التحقق من سلامة سجلات الطلاب
    merged.students = merged.students.map((st) => ({
      id: String(st.id || '').trim(),
      name: String(st.name || '').trim(),
      age: Number(st.age) || 0,
      parentPhone: String(st.parentPhone || '').trim(),
      circleId: String(st.circleId || ''),
      points: Number(st.points) || 0,
      pointsLog: this._compactStudentLog(Array.isArray(st.pointsLog) ? st.pointsLog : []),
      createdAt: st.createdAt || new Date().toISOString()
    }));

    return merged;
  },

  _compactStudentLog(log) {
    const out = this._compactLog(log);
    if (out !== log) this._logsCompacted = true;
    return out;
  },

  /**
   * نسخة مشتركة من الكاش للقراءة فقط (لا تعدّلها). تُقرأ من localStorage مرة واحدة ثم تبقى بالذاكرة.
   */
  _peek() {
    if (this._cache) return this._cache;
    this.init();
    return this._cache;
  },

  /**
   * قراءة كامل البيانات: نسخة مستقلة يمكن تعديلها ثم تمريرها إلى saveData
   */
  getData() {
    return this._clone(this._peek());
  },

  /**
   * حفظ كامل البيانات في localStorage. عند الفشل (امتلاء التخزين مثلاً) يُرمى خطأ بعبارة عربية
   * ولا يتغير الكاش، فتبقى الواجهة مطابقة لما هو محفوظ فعلاً.
   */
  saveData(data) {
    let json;
    try {
      json = JSON.stringify(data);
      localStorage.setItem(DB_STORAGE_KEY, json);
    } catch (err) {
      this._cache = null; // المرجع الوحيد للحقيقة هو ما في التخزين
      const quota =
        err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
      const e = new Error(
        quota
          ? 'مساحة التخزين في المتصفح ممتلئة ولم تُحفظ هذه العملية. صدّر نسخة احتياطية ثم احذف بيانات أو خلفيات غير لازمة.'
          : 'تعذر حفظ البيانات على هذا الجهاز (قد يكون التخزين معطّلاً أو وضع التصفح الخاص مفعّلاً).'
      );
      e.cause = err;
      throw e;
    }
    this._cache = this._mergeDefaults(JSON.parse(json));
  },

  /* ========================================================================
     إدارة الحلقات (Circles Management)
     ======================================================================== */

  getCircles() {
    return this._peek().circles;
  },

  getCircleById(circleId) {
    return this.getCircles().find((c) => c.id === circleId) || null;
  },

  addCircle(name, prefix) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new Error('يرجى إدخال اسم الحلقة.');
    }

    const data = this.getData();
    const exists = data.circles.some((c) => c.name === trimmedName);
    if (exists) {
      throw new Error('توجد حلقة بهذا الاسم مسبقاً.');
    }

    const cleanPrefix = this.normalizePrefix(prefix);
    if (!cleanPrefix) {
      throw new Error('رمز المعرّف يجب أن يكون من 2 إلى 4 أحرف أو أرقام إنجليزية (مثل QAT).');
    }

    const newCircle = {
      id: 'CIRCLE-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name: trimmedName,
      prefix: cleanPrefix,
      createdAt: new Date().toISOString()
    };

    data.circles.push(newCircle);
    this.saveData(data);
    return newCircle;
  },

  /**
   * حذف حلقة. إن كان فيها طلاب يجب تحديد حلقة أخرى (moveToCircleId) لنقلهم إليها،
   * فلا يبقى أي طالب بدون حلقة. يرجع عدد الطلاب المنقولين.
   */
  deleteCircle(circleId, moveToCircleId) {
    const data = this.getData();
    const count = data.students.filter((s) => s.circleId === circleId).length;
    if (count > 0) {
      const target = data.circles.find((c) => c.id === moveToCircleId && c.id !== circleId);
      if (!target) throw new Error('اختر حلقة أخرى لنقل الطلاب إليها قبل الحذف.');
      data.students.forEach((s) => {
        if (s.circleId === circleId) s.circleId = target.id;
      });
    }
    data.circles = data.circles.filter((c) => c.id !== circleId);
    this.saveData(data);
    return count;
  },

  /**
   * تعديل اسم الحلقة ورمز معرّفها (الرمز الجديد يخص الطلاب الجدد فقط؛ معرّفات القدامى ثابتة)
   */
  updateCircle(circleId, { name, prefix }) {
    const data = this.getData();
    const circle = data.circles.find((c) => c.id === circleId);
    if (!circle) throw new Error('الحلقة غير موجودة.');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('اسم الحلقة مطلوب.');
    if (data.circles.some((c) => c.id !== circleId && c.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('توجد حلقة أخرى بنفس الاسم.');
    }
    const cleanPrefix = this.normalizePrefix(prefix);
    if (!cleanPrefix) throw new Error('رمز المعرّف يجب أن يكون من 2 إلى 4 أحرف أو أرقام إنجليزية.');
    circle.name = cleanName;
    circle.prefix = cleanPrefix;
    this.saveData(data);
    return circle;
  },

  /**
   * التراجع عن عملية نقاط: يُضاف قيد عكسي (يبقى السجل الأصلي ظاهراً للتدقيق)
   * ويُعلَّم الأصلي reverted. لا يمكن التراجع عن قيد تراجع.
   */
  revertLogEntry(studentId, logId) {
    const data = this.getData();
    const st = data.students.find((s) => s.id === studentId);
    if (!st) throw new Error('الطالب غير موجود.');
    const entry = (st.pointsLog || []).find((l) => l.id === logId);
    if (!entry) throw new Error('العملية غير موجودة.');
    if (entry.summary) throw new Error('لا يمكن التراجع عن سجل المجموع (يضم عمليات قديمة).');
    if (entry.reverted || entry.revertOf) throw new Error('لا يمكن التراجع عن هذه العملية.');
    const change = -Number(entry.change);
    st.points = (Number(st.points) || 0) + change;
    entry.reverted = true;
    this._pushLog(st, {
      id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
      change,
      operation: change > 0 ? 'add' : 'deduct',
      reason: 'تراجع عن: ' + entry.reason,
      timestamp: new Date().toISOString(),
      revertOf: entry.id
    });
    this.saveData(data);
    return st;
  },

  /* ========================================================================
     إدارة الطلاب (Students Management)
     ======================================================================== */

  /**
   * توليد معرّف فريد غير متكرر للطالب بصيغة QAT-1001
   */
  normalizePrefix(raw) {
    const p = String(raw || '').trim().toUpperCase();
    return /^[A-Z0-9]{2,4}$/.test(p) ? p : '';
  },

  /**
   * المعرّف = رمز حلقة الطالب + رقم تسلسلي عام غير مكرر (مثل ABC-1005).
   * الرقم فريد عبر كل الحلقات، فيمكن إدخال الرقم وحده يدوياً دون التباس.
   * يبقى المعرّف ثابتاً حتى لو انتقل الطالب لحلقة أخرى (لأن بطاقته مطبوعة).
   */
  _generateNextStudentId(data, circleId) {
    const circle = data.circles.find((c) => c.id === circleId);
    const prefix = this.normalizePrefix(circle && circle.prefix) || 'QAT';
    const usedNumbers = new Set(data.students.map((s) => (String(s.id).match(/(\d+)$/) || [])[1]));

    let nextNum = (Number(data.lastStudentNumber) || 1000) + 1;
    while (usedNumbers.has(String(nextNum))) {
      nextNum++;
    }

    data.lastStudentNumber = nextNum;
    return `${prefix}-${nextNum}`;
  },

  /**
   * إيجاد فهرس طالب من معرّف كامل (ABC-1005) أو من الرقم وحده (1005)
   */
  _findStudentIndexByToken(data, token) {
    const t = String(token || '').trim().toUpperCase();
    if (/^\d+$/.test(t)) {
      return data.students.findIndex((s) => (String(s.id).match(/(\d+)$/) || [])[1] === t);
    }
    return data.students.findIndex((s) => s.id.toUpperCase() === t);
  },

  /**
   * جلب قائمة الطلاب مع دعم التصفية بالحلقة، البحث الفوري، والفرز الأبجدي
   */
  getStudents({ circleId = 'ALL', searchQuery = '', sortAlphabetically = false } = {}) {
    let list = [...this._peek().students];

    if (circleId && circleId !== 'ALL') {
      list = list.filter((s) => s.circleId === circleId);
    }

    const q = String(searchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.parentPhone && s.parentPhone.toLowerCase().includes(q))
      );
    }

    if (sortAlphabetically) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }

    return list;
  },

  /**
   * البحث عن طالب بواسطة المعرّف (غير حساس لحالة الأحرف)
   */
  getStudentById(studentId) {
    if (!studentId) return null;
    const cleanId = String(studentId).trim().toUpperCase();
    return this._peek().students.find((s) => s.id.toUpperCase() === cleanId) || null;
  },

  /**
   * إضافة طالب جديد
   */
  addStudent({ name, age, parentPhone, circleId }) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new Error('اسم الطالب مطلوب.');
    }

    const numericAge = Number(age);
    if (isNaN(numericAge) || numericAge <= 0) {
      throw new Error('يرجى إدخال عمر صحيح للطالب.');
    }

    const data = this.getData();
    const targetCircleId = circleId || (data.circles[0] ? data.circles[0].id : '');
    const newId = this._generateNextStudentId(data, targetCircleId);

    const newStudent = {
      id: newId,
      name: trimmedName,
      age: numericAge,
      parentPhone: String(parentPhone || '').trim(),
      circleId: targetCircleId,
      points: 0,
      pointsLog: [],
      createdAt: new Date().toISOString()
    };

    data.students.push(newStudent);
    this.saveData(data);
    return newStudent;
  },

  /**
   * تعديل البيانات الشخصية للطالب (الاسم، العمر، هاتف الأهل، الحلقة)
   */
  updateStudent(studentId, { name, age, parentPhone, circleId }) {
    const data = this.getData();
    const index = data.students.findIndex((s) => s.id.toUpperCase() === String(studentId).trim().toUpperCase());
    if (index === -1) {
      throw new Error('لم يتم العثور على الطالب المطلوب.');
    }

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new Error('اسم الطالب لا يمكن أن يكون فارغاً.');
    }

    const numericAge = Number(age);
    if (isNaN(numericAge) || numericAge <= 0) {
      throw new Error('يرجى إدخال عمر صحيح.');
    }

    data.students[index] = {
      ...data.students[index],
      name: trimmedName,
      age: numericAge,
      parentPhone: String(parentPhone || '').trim(),
      circleId: circleId !== undefined ? circleId : data.students[index].circleId
    };

    this.saveData(data);
    return data.students[index];
  },

  /**
   * حذف طالب نهائياً
   */
  deleteStudent(studentId) {
    const data = this.getData();
    const cleanId = String(studentId).trim().toUpperCase();
    const initialLength = data.students.length;
    data.students = data.students.filter((s) => s.id.toUpperCase() !== cleanId);

    if (data.students.length === initialLength) {
      throw new Error('لم يتم العثور على الطالب لحذفه.');
    }

    this.saveData(data);
    return true;
  },

  /* ========================================================================
     إدارة النقاط والسجلات والمراكز (Points & Leaderboard)
     ======================================================================== */

  /**
   * إضافة أو خصم نقاط لطالب واحد مع توثيق السبب والتاريخ في pointsLog
   * @param {string} studentId معرّف الطالب
   * @param {number} pointsValue مقدار النقاط (عدد موجب)
   * @param {'add'|'deduct'} operationType نوع العملية ('add' للإضافة، 'deduct' للخصم)
   * @param {string} reason سبب العملية (إلزامي)
   */
  modifyStudentPoints(studentId, pointsValue, operationType, reason) {
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      throw new Error('يرجى كتابة سبب إضافة أو إزالة النقاط.');
    }

    const rawAmount = Math.abs(Number(pointsValue));
    if (isNaN(rawAmount) || rawAmount <= 0) {
      throw new Error('يرجى إدخال قيمة نقاط صحيحة أكبر من الصفر.');
    }

    const signedChange = operationType === 'deduct' ? -rawAmount : rawAmount;
    const data = this.getData();
    const cleanId = String(studentId || '').trim().toUpperCase();
    const index = data.students.findIndex((s) => s.id.toUpperCase() === cleanId);

    if (index === -1) {
      throw new Error(`لم يتم العثور على طالب بالمعرّف (${cleanId}).`);
    }

    const student = data.students[index];
    student.points = (Number(student.points) || 0) + signedChange;

    const logEntry = {
      id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      change: signedChange,
      operation: operationType === 'deduct' ? 'deduct' : 'add',
      reason: cleanReason,
      timestamp: new Date().toISOString()
    };

    // إضافة السجل الجديد في بداية المصفوفة ليكون الأحدث في الأعلى (مع الضغط عند تجاوز الحد)
    this._pushLog(student, logEntry);

    this.saveData(data);
    return {
      student: student,
      logEntry: logEntry
    };
  },

  /**
   * تعديل جماعي للنقاط عبر قائمة معرّفات (Batch IDs)
   * يدعم نمطين:
   * - 'present_add': تطبيق الإضافة مباشرة على المعرّفات المدخلة
   * - 'absent_deduct': تطبيق الخصم مباشرة على المعرّفات المدخلة
   */
  batchModifyPointsByIds(rawIdsArray, pointsValue, operationType, reason) {
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      throw new Error('يرجى إدخال السبب لتوثيقه في سجلات الطلاب.');
    }

    const rawAmount = Math.abs(Number(pointsValue));
    if (isNaN(rawAmount) || rawAmount <= 0) {
      throw new Error('يرجى إدخال عدد نقاط صحيح أكبر من الصفر.');
    }

    const normalizedIds = Array.from(
      new Set(
        rawIdsArray
          .map((id) => String(id || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (normalizedIds.length === 0) {
      throw new Error('يرجى إدخال معرّف طالب واحد على الأقل.');
    }

    const data = this.getData();
    const signedChange = operationType === 'deduct' ? -rawAmount : rawAmount;
    const updatedStudents = [];
    const notFoundIds = [];
    const nowIso = new Date().toISOString();

    normalizedIds.forEach((targetId) => {
      const idx = this._findStudentIndexByToken(data, targetId);
      if (idx === -1) {
        notFoundIds.push(targetId);
      } else if (!updatedStudents.includes(data.students[idx])) {
        const st = data.students[idx];
        st.points = (Number(st.points) || 0) + signedChange;
        this._pushLog(st, {
          id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
          change: signedChange,
          operation: operationType === 'deduct' ? 'deduct' : 'add',
          reason: cleanReason,
          timestamp: nowIso
        });
        updatedStudents.push(st);
      }
    });

    if (updatedStudents.length > 0) {
      this.saveData(data);
    }

    return {
      updatedStudents,
      notFoundIds,
      signedChange
    };
  },

  /**
   * تطبيق جلسة حضور/غياب دفعة واحدة:
   * - الحاضرون (المعرّفات الممسوحة/المدخلة): إضافة presentPoints مع presentReason.
   * - الغائبون = كل طلاب الحلقة المختارة غير الحاضرين: خصم absentPoints مع absentReason
   *   (إذا كان absentPoints = 0 لا يُخصم شيء ولا يُسجَّل أي سبب للغائبين).
   * dryRun=true يحسب الأعداد فقط دون أي تعديل (للمعاينة قبل التأكيد).
   */
  applyAttendanceSession({ circleId, presentTokens = [], presentPoints, presentReason, absentPoints, absentReason, dryRun = false }) {
    const presentAmt = Math.abs(Number(presentPoints)) || 0;
    const absentAmt = Math.abs(Number(absentPoints)) || 0;
    const pReason = String(presentReason || '').trim();
    const aReason = String(absentReason || '').trim();

    if (presentAmt === 0 && absentAmt === 0) {
      throw new Error('حدّد عدد نقاط للحاضرين أو للغائبين.');
    }
    if (presentAmt > 0 && !pReason) {
      throw new Error('يرجى كتابة سبب إضافة النقاط للحاضرين.');
    }
    if (absentAmt > 0 && !aReason) {
      throw new Error('يرجى كتابة سبب خصم النقاط من الغائبين.');
    }
    if (absentAmt > 0 && !this.getCircleById(circleId)) {
      throw new Error('اختر الحلقة لتحديد الغائبين.');
    }

    const data = this.getData();
    const presentSet = new Set();
    const notFoundIds = [];
    presentTokens.forEach((tok) => {
      const idx = this._findStudentIndexByToken(data, tok);
      if (idx === -1) notFoundIds.push(String(tok));
      else presentSet.add(data.students[idx].id);
    });

    const presentList = presentAmt > 0 ? data.students.filter((s) => presentSet.has(s.id)) : [];
    const absentList = absentAmt > 0
      ? data.students.filter((s) => s.circleId === circleId && !presentSet.has(s.id))
      : [];
    const result = {
      presentCount: presentList.length,
      absentCount: absentList.length,
      notFoundIds
    };
    if (dryRun) return result;

    const nowIso = new Date().toISOString();
    const addLog = (st, change, operation, reason) => {
      st.points = (Number(st.points) || 0) + change;
      this._pushLog(st, {
        id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
        change,
        operation,
        reason,
        timestamp: nowIso
      });
    };
    presentList.forEach((st) => addLog(st, presentAmt, 'add', pReason));
    absentList.forEach((st) => addLog(st, -absentAmt, 'deduct', aReason));
    if (presentList.length || absentList.length) this.saveData(data);
    return result;
  },

  /**
   * جلب قائمة المراكز مرتبة تنازلياً حسب النقاط
   */
  getLeaderboard({ circleId = 'ALL', searchQuery = '' } = {}) {
    const students = this.getStudents({ circleId, searchQuery, sortAlphabetically: false });
    return students.sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.name.localeCompare(b.name, 'ar');
    });
  },

  /* ========================================================================
     إدارة الإعدادات وتصميم البطاقة والنسخ الاحتياطي (Settings & Backup)
     ======================================================================== */

  getSettings() {
    return this._clone(this._peek().settings);
  },

  updateSettings(partialSettings) {
    const data = this.getData();
    data.settings = {
      ...data.settings,
      ...partialSettings
    };
    this.saveData(data);
    return data.settings;
  },

  getCardDesign() {
    return this._clone(this._peek().settings.cardDesign);
  },

  saveCardDesign(frontConfig, backConfig) {
    const data = this.getData();
    data.settings.cardDesign = {
      front: {
        ...data.settings.cardDesign.front,
        ...(frontConfig || {})
      },
      back: {
        ...data.settings.cardDesign.back,
        ...(backConfig || {})
      }
    };
    this.saveData(data);
    return data.settings.cardDesign;
  },

  /**
   * تصدير قاعدة البيانات بالكامل كنص JSON للنسخ الاحتياطي في ملف .txt
   */
  exportDatabaseAsJsonString() {
    const data = this.getData();
    const payload = {
      app: 'إدارة الحلقات القرآنية - شباب مسجد قطنا',
      schemaVersion: DB_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: data
    };
    return JSON.stringify(payload, null, 2);
  },

  /**
   * استيراد قاعدة البيانات من محتوى ملف نصي .txt
   */
  /** قراءة نص النسخة الاحتياطية والتحقق منها دون حفظ أي شيء */
  parseBackupString(jsonText) {
    if (!jsonText || typeof jsonText !== 'string') {
      throw new Error('ملف النسخة الاحتياطية فارغ أو غير صالح.');
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('صيغة الملف غير صالحة (لا يحتوي على بيانات JSON سليمة).');
    }
    const rawDb = parsed && parsed.data && Array.isArray(parsed.data.students) ? parsed.data : parsed;
    if (!rawDb || !Array.isArray(rawDb.students) || !Array.isArray(rawDb.circles)) {
      throw new Error('الملف المرفوع لا يتطابق مع هيكل بيانات نظام الحلقات القرآنية.');
    }
    // نسخة بلا حقل إصدار = نسخة قديمة (1) وتُقبل. نسخة أحدث من التطبيق تُرفض كي لا تُفقد حقولها.
    const version = Number(parsed.schemaVersion ?? rawDb.schemaVersion ?? 1) || 1;
    if (version > DB_SCHEMA_VERSION) {
      throw new Error('هذه النسخة الاحتياطية من إصدار أحدث من التطبيق. حدّث التطبيق ثم أعد الاستيراد.');
    }
    return this._mergeDefaults(rawDb);
  },

  /** استبدال كل البيانات (بما فيها الإعدادات وتصميم البطاقات) */
  replaceAllData(validatedData) {
    this.saveData(validatedData);
    return validatedData;
  },

  /** مُبقى للتوافق: تحقق ثم استبدال مباشر */
  importDatabaseFromJsonString(jsonText) {
    return this.replaceAllData(this.parseBackupString(jsonText));
  },

  /**
   * دمج نسخة مستوردة مع البيانات الحالية (الإعدادات الحالية تبقى كما هي):
   * - الحلقة تُطابَق بالمعرّف ثم بالاسم، وإلا تُضاف حلقة جديدة.
   * - طالب بنفس المعرّف والاسم = مكرر يُتخطى. نفس المعرّف لطالب مختلف = تعارض،
   *   فيأخذ المستورد معرّفاً جديداً (وبطاقته المطبوعة القديمة لن تصلح له).
   */
  mergeImportedData(imported) {
    const data = this.getData();
    const num = (id) => Number((String(id).match(/(\d+)$/) || [])[1]) || 0;
    // نرفع العدّاد فوق كل أرقام الملف المستورد قبل توليد أي معرّف جديد
    data.lastStudentNumber = Math.max(
      Number(data.lastStudentNumber) || 1000,
      Number(imported.lastStudentNumber) || 1000,
      ...imported.students.map((s) => num(s.id))
    );

    const circleMap = {};
    const summary = { addedCircles: 0, addedStudents: 0, skippedDuplicates: 0, renumbered: 0 };
    imported.circles.forEach((ic) => {
      const key = String(ic.name).trim().toLowerCase();
      const target =
        data.circles.find((c) => c.id === ic.id) ||
        data.circles.find((c) => c.name.trim().toLowerCase() === key);
      if (target) {
        circleMap[ic.id] = target.id;
      } else {
        data.circles.push({ ...ic });
        circleMap[ic.id] = ic.id;
        summary.addedCircles++;
      }
    });

    imported.students.forEach((is) => {
      const circleId = circleMap[is.circleId] || (data.circles[0] ? data.circles[0].id : '');
      const existing = data.students.find((s) => s.id.toUpperCase() === String(is.id).toUpperCase());
      if (existing && existing.name.trim() === String(is.name).trim()) {
        summary.skippedDuplicates++;
        return;
      }
      const id = existing ? this._generateNextStudentId(data, circleId) : is.id;
      if (existing) summary.renumbered++;
      data.students.push({ ...is, id, circleId });
      summary.addedStudents++;
    });

    this.saveData(data);
    return summary;
  }
};

// تهيئة قاعدة البيانات فوراً وتصديرها للنطاق العام (window)
window.DB = DB;

// تعديل البيانات من تبويب آخر: نُسقط الكاش ليُعاد تحميله من التخزين
window.addEventListener('storage', (e) => {
  if (e.key === DB_STORAGE_KEY || e.key === null) DB._cache = null;
});
DB.init();