/**
 * إدارة قاعدة البيانات المحلية (localStorage) - شباب مسجد قطنا
 * يتولى تهيئة البيانات، الحلقات، الطلاب، سجل النقاط، الإعدادات، والنسخ الاحتياطي (TXT)
 */

const DB_STORAGE_KEY = 'QATANA_MOSQUE_QURAN_DB_V1';

const DEFAULT_DB_STATE = {
  lastStudentNumber: 1000,
  circles: [
    {
      id: 'CIRCLE-1',
      name: 'حلقة أبي بكر الصديق',
      createdAt: new Date().toISOString()
    }
  ],
  students: [],
  settings: {
    theme: 'emerald', // 'emerald' | 'forest' | 'olive'
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
  /**
   * تهيئة قاعدة البيانات في localStorage عند التشغيل لأول مرة
   */
  init() {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      this.saveData(DEFAULT_DB_STATE);
      return JSON.parse(JSON.stringify(DEFAULT_DB_STATE));
    }
    try {
      const parsed = JSON.parse(raw);
      return this._mergeDefaults(parsed);
    } catch (err) {
      console.error('خطأ في قراءة قاعدة البيانات، سيتم استعادة الهيكل الافتراضي:', err);
      this.saveData(DEFAULT_DB_STATE);
      return JSON.parse(JSON.stringify(DEFAULT_DB_STATE));
    }
  },

  /**
   * ضمان وجود كافة الحقول الأساسية عند تحديث النسخ أو الاستيراد
   */
  _mergeDefaults(data) {
    const merged = {
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

    // التحقق من سلامة سجلات الطلاب
    merged.students = merged.students.map((st) => ({
      id: String(st.id || '').trim(),
      name: String(st.name || '').trim(),
      age: Number(st.age) || 0,
      parentPhone: String(st.parentPhone || '').trim(),
      circleId: String(st.circleId || ''),
      points: Number(st.points) || 0,
      pointsLog: Array.isArray(st.pointsLog) ? st.pointsLog : [],
      createdAt: st.createdAt || new Date().toISOString()
    }));

    return merged;
  },

  /**
   * قراءة كامل البيانات من localStorage
   */
  getData() {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      return this.init();
    }
    try {
      return this._mergeDefaults(JSON.parse(raw));
    } catch (e) {
      return this.init();
    }
  },

  /**
   * حفظ كامل البيانات في localStorage
   */
  saveData(data) {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(data));
  },

  /* ========================================================================
     إدارة الحلقات (Circles Management)
     ======================================================================== */

  getCircles() {
    return this.getData().circles;
  },

  getCircleById(circleId) {
    return this.getCircles().find((c) => c.id === circleId) || null;
  },

  addCircle(name) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new Error('يرجى إدخال اسم الحلقة.');
    }

    const data = this.getData();
    const exists = data.circles.some((c) => c.name === trimmedName);
    if (exists) {
      throw new Error('توجد حلقة بهذا الاسم مسبقاً.');
    }

    const newCircle = {
      id: 'CIRCLE-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name: trimmedName,
      createdAt: new Date().toISOString()
    };

    data.circles.push(newCircle);
    this.saveData(data);
    return newCircle;
  },

  deleteCircle(circleId) {
    const data = this.getData();
    data.circles = data.circles.filter((c) => c.id !== circleId);
    // فك ارتباط الطلاب التابعين للحلقة المحذوفة أو نقلهم لأول حلقة متاحة
    const fallbackCircleId = data.circles.length > 0 ? data.circles[0].id : '';
    data.students = data.students.map((s) => {
      if (s.circleId === circleId) {
        return { ...s, circleId: fallbackCircleId };
      }
      return s;
    });
    this.saveData(data);
  },

  /* ========================================================================
     إدارة الطلاب (Students Management)
     ======================================================================== */

  /**
   * توليد معرّف فريد غير متكرر للطالب بصيغة QAT-1001
   */
  _generateNextStudentId(data) {
    let nextNum = (Number(data.lastStudentNumber) || 1000) + 1;
    const existingIds = new Set(data.students.map((s) => s.id.toUpperCase()));

    while (existingIds.has(`QAT-${nextNum}`)) {
      nextNum++;
    }

    data.lastStudentNumber = nextNum;
    return `QAT-${nextNum}`;
  },

  /**
   * جلب قائمة الطلاب مع دعم التصفية بالحلقة، البحث الفوري، والفرز الأبجدي
   */
  getStudents({ circleId = 'ALL', searchQuery = '', sortAlphabetically = false } = {}) {
    const data = this.getData();
    let list = [...data.students];

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
    const data = this.getData();
    return data.students.find((s) => s.id.toUpperCase() === cleanId) || null;
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
    const newId = this._generateNextStudentId(data);

    const newStudent = {
      id: newId,
      name: trimmedName,
      age: numericAge,
      parentPhone: String(parentPhone || '').trim(),
      circleId: circleId || (data.circles[0] ? data.circles[0].id : ''),
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

    if (!Array.isArray(student.pointsLog)) {
      student.pointsLog = [];
    }
    // إضافة السجل الجديد في بداية المصفوفة ليكون الأحدث في الأعلى
    student.pointsLog.unshift(logEntry);

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
      const idx = data.students.findIndex((s) => s.id.toUpperCase() === targetId);
      if (idx === -1) {
        notFoundIds.push(targetId);
      } else {
        const st = data.students[idx];
        st.points = (Number(st.points) || 0) + signedChange;
        if (!Array.isArray(st.pointsLog)) {
          st.pointsLog = [];
        }
        st.pointsLog.unshift({
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
    return this.getData().settings;
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
    return this.getData().settings.cardDesign;
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
      exportedAt: new Date().toISOString(),
      data: data
    };
    return JSON.stringify(payload, null, 2);
  },

  /**
   * استيراد قاعدة البيانات من محتوى ملف نصي .txt
   */
  importDatabaseFromJsonString(jsonText) {
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

    const validatedData = this._mergeDefaults(rawDb);
    this.saveData(validatedData);
    return validatedData;
  }
};

// تهيئة قاعدة البيانات فوراً وتصديرها للنطاق العام (window)
window.DB = DB;
DB.init();