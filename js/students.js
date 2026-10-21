/**
 * منطق اللوحة الرئيسية حصراً (students.js) - شباب مسجد قطنا
 * يدير: الحلقات القرآنية، إضافة الطلاب، البحث الفوري، الفرز الأبجدي،
 * عرض بطاقات الطلاب (الاسم، العمر، المعرّف)، ونافذة تعديل وحذف الطالب.
 * يلتزم بالفصل الصارم: لا يحتوي على أي أزرار أو عمليات تعديل نقاط.
 */

const StudentsView = {
  state: {
    selectedCircleId: 'ALL',
    searchQuery: '',
    sortAlphabetically: false
  },

  init() {
    this.bindEvents();
    this.refreshAll();
    this.initStickyFinder();
  },

  /**
   * تحديث كافة عناصر اللوحة الرئيسية (الإحصائيات، شريط الحلقات، وقائمة الطلاب)
   */
  refreshAll() {
    this.renderCirclesBar();
    this.populateCircleSelectDropdowns();
    this.renderStudentsGrid();
    this.updateDashboardStats();
  },

  /* ========================================================================
     1. ربط الأحداث الخاصة باللوحة الرئيسية ونوافذها المنبثقة
     ======================================================================== */

  bindEvents() {
    // الزر العائم وقائمته (إضافة طالب/حلقة، معلومات)
    this.bindFab();

    // معالجة نموذج إضافة حلقة جديدة
    const addCircleForm = document.getElementById('form-add-circle');
    if (addCircleForm) {
      addCircleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('input-circle-name');
        try {
          const prefixInput = document.getElementById('input-circle-prefix');
          const newCircle = DB.addCircle(nameInput.value, prefixInput ? prefixInput.value : 'QAT');
          this.state.selectedCircleId = newCircle.id;
          UI.closeModal('modal-add-circle');
          this.refreshAll();
          if (window.PointsView) window.PointsView.refreshAll();
          if (window.CardsPDF) window.CardsPDF.refreshAll();
          UI.showToast(`تمت إضافة "${newCircle.name}" بنجاح`, 'success');
        } catch (err) {
          UI.showToast(err.message || 'تعذر إضافة الحلقة', 'error');
        }
      });
    }

    // نافذتا تعديل وحذف الحلقة (تُفتحان من الزر العائم)
    this.bindCircleManagementModals();

    // معالجة نموذج إضافة طالب جديد
    const addStudentForm = document.getElementById('form-add-student');
    if (addStudentForm) {
      addStudentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('input-student-name').value;
        const age = document.getElementById('input-student-age').value;
        const parentPhone = document.getElementById('input-student-phone').value;
        const circleId = document.getElementById('input-student-circle').value;

        try {
          const newStudent = DB.addStudent({ name, age, parentPhone, circleId });
          UI.closeModal('modal-add-student');
          this.refreshAll();
          if (window.PointsView) window.PointsView.refreshAll();
          if (window.CardsPDF) window.CardsPDF.refreshAll();
          UI.showToast(`تم تسجيل الطالب "${newStudent.name}" بالمعرّف (${newStudent.id})`, 'success', 2500);
        } catch (err) {
          UI.showToast(err.message || 'حدث خطأ أثناء إضافة الطالب', 'error');
        }
      });
    }

    // شريط البحث الفوري (Live Search)
    const searchInput = document.getElementById('dashboard-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value;
        this.renderStudentsGrid();
        this.updateDashboardStats();
      });
    }

    // زر تبديل الفرز الأبجدي حسب الاسم
    const sortBtn = document.getElementById('btn-toggle-alpha-sort');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        this.state.sortAlphabetically = !this.state.sortAlphabetically;
        sortBtn.setAttribute('data-sorted', String(this.state.sortAlphabetically));
        sortBtn.classList.toggle('btn-primary', this.state.sortAlphabetically);
        sortBtn.classList.toggle('btn-secondary', !this.state.sortAlphabetically);

        const label = document.getElementById('alpha-sort-label');
        if (label) {
          label.textContent = this.state.sortAlphabetically
            ? 'ترتيب أبجدي (أ - ي): مفعل'
            : 'ترتيب أبجدي: إيقاف';
        }
        this.renderStudentsGrid();
      });
    }

    // معالجة نموذج تعديل وحفظ بيانات الطالب الشخصية (Edit Profile Modal)
    const editStudentForm = document.getElementById('form-edit-student');
    if (editStudentForm) {
      editStudentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const studentId = document.getElementById('edit-student-id').value;
        const name = document.getElementById('edit-student-name').value;
        const age = document.getElementById('edit-student-age').value;
        const parentPhone = document.getElementById('edit-student-phone').value;
        const circleId = document.getElementById('edit-student-circle').value;

        try {
          const updated = DB.updateStudent(studentId, { name, age, parentPhone, circleId });
          UI.closeModal('modal-edit-student');
          this.refreshAll();
          if (window.PointsView) window.PointsView.refreshAll();
          if (window.CardsPDF) window.CardsPDF.refreshAll();
          UI.showToast(`تم حفظ تعديلات الطالب "${updated.name}" بنجاح`, 'success');
        } catch (err) {
          UI.showToast(err.message || 'تعذر حفظ التعديلات', 'error');
        }
      });
    }

    // زر حذف الطالب المحمي برسالة تأكيد (Confirmation)
    const deleteStudentBtn = document.getElementById('btn-delete-student');
    if (deleteStudentBtn) {
      deleteStudentBtn.addEventListener('click', () => {
        const studentId = document.getElementById('edit-student-id').value;
        const student = DB.getStudentById(studentId);
        if (!student) return;

        const confirmed = window.confirm(
          `تأكيد الحذف النهائي:\nهل أنت متأكد من حذف الطالب "${student.name}" (${student.id}) وكافة سجلاته؟ لا يمكن التراجع عن هذه العملية.`
        );
        if (!confirmed) return;

        try {
          DB.deleteStudent(student.id);
          UI.closeModal('modal-edit-student');
          this.refreshAll();
          if (window.PointsView) window.PointsView.refreshAll();
          if (window.CardsPDF) window.CardsPDF.refreshAll();
          UI.showToast(`تم حذف الطالب "${student.name}" نهائياً`, 'warning');
        } catch (err) {
          UI.showToast(err.message || 'حدث خطأ أثناء الحذف', 'error');
        }
      });
    }
  },

  /* ========================================================================
     1.أ اندماج قسم البحث مع الشريط العلوي عند التمرير (is-stuck)
     عند ملامسة قسم البحث للشريط العلوي: يأخذ خلفيته، وتنطوي شرائح الحلقات
     ويبقى البحث وزر الترتيب. وتعود الشرائح عند الرجوع للأعلى.
     ======================================================================== */

  initStickyFinder() {
    const finder = document.getElementById('dashboard-finder');
    const sentinel = document.getElementById('finder-sentinel');
    const header = document.querySelector('.app-header');
    if (!finder || !sentinel || !header) return;

    let headerH = Math.round(header.getBoundingClientRect().height);

    // عرض الصفحة بدون شريط التمرير العمودي: خلفية الالتصاق بعرض الشاشة كاملة دون أي تمرير أفقي
    const root = document.documentElement;
    const syncDocWidth = () => root.style.setProperty('--doc-w', `${root.clientWidth}px`);
    syncDocWidth();
    if (typeof ResizeObserver === 'function') new ResizeObserver(syncDocWidth).observe(root);
    window.addEventListener('resize', syncDocWidth);

    // الحالة تُحسب من موضع الحارس مباشرة (لا تعتمد على إشعارات المراقب وحدها)
    this.syncStickyState = () => {
      const r = sentinel.getBoundingClientRect();
      // عنصر مخفي (تبويب آخر) يعطي أبعاداً صفرية: لا التصاق
      const stuck = r.height > 0 && r.top < headerH;
      finder.classList.toggle('is-stuck', stuck);
      document.body.classList.toggle('finder-stuck', stuck);
    };

    let observer = null;
    const setup = () => {
      headerH = Math.round(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--app-header-h', `${headerH}px`);
      if (observer) observer.disconnect();
      if (typeof IntersectionObserver === 'function') {
        observer = new IntersectionObserver(() => this.syncStickyState(), {
          rootMargin: `-${headerH}px 0px 0px 0px`,
          threshold: 0
        });
        observer.observe(sentinel);
      }
      this.syncStickyState();
    };

    setup();
    if (typeof ResizeObserver === 'function') {
      let lastH = headerH;
      new ResizeObserver(() => {
        const h = Math.round(header.getBoundingClientRect().height);
        if (h !== lastH) { lastH = h; setup(); }
      }).observe(header);
    } else {
      window.addEventListener('resize', setup);
    }
  },

  /* ========================================================================
     1.ب الزر العائم (FAB) وإجراءاته
     ======================================================================== */

  bindFab() {
    const main = document.getElementById('fab-main');
    const menu = document.getElementById('fab-menu');
    const backdrop = document.getElementById('fab-backdrop');
    const wrap = document.getElementById('fab-wrap');
    if (!main || !menu || !wrap) return;

    main.addEventListener('click', () => {
      this.setFabOpen(!wrap.classList.contains('open'));
    });
    if (backdrop) backdrop.addEventListener('click', () => this.setFabOpen(false));

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-fab-action]');
      if (!item) return;
      this.setFabOpen(false);
      this.runFabAction(item.getAttribute('data-fab-action'));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.classList.contains('open')) {
        this.setFabOpen(false);
        main.focus();
      }
    });
  },

  setFabOpen(open) {
    const main = document.getElementById('fab-main');
    const wrap = document.getElementById('fab-wrap');
    const backdrop = document.getElementById('fab-backdrop');
    if (!main || !wrap) return;
    wrap.classList.toggle('open', open);
    main.classList.toggle('is-active', open);
    main.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
  },

  runFabAction(action) {
    switch (action) {
      case 'add-student': this.openAddStudent(); break;
      case 'add-circle': this.openAddCircle(); break;
      case 'edit-circle': this.openEditCircle(); break;
      case 'delete-circle': this.openDeleteCircle(); break;
      case 'info': this.openInfo(); break;
      default: break;
    }
  },

  openAddCircle() {
    const form = document.getElementById('form-add-circle');
    if (form) form.reset();
    UI.openModal('modal-add-circle');
  },

  openAddStudent() {
    const circles = DB.getCircles();
    if (circles.length === 0) {
      UI.showToast('يرجى إضافة حلقة قرآنية واحدة على الأقل قبل تسجيل الطلاب', 'warning', 2800);
      UI.openModal('modal-add-circle');
      return;
    }

    const form = document.getElementById('form-add-student');
    if (form) form.reset();
    this.populateCircleSelectDropdowns();

    // اختيار الحلقة المفتوحة حالياً كخيار افتراضي لتسهيل الإدخال
    const circleSelect = document.getElementById('input-student-circle');
    if (circleSelect && this.state.selectedCircleId !== 'ALL') {
      circleSelect.value = this.state.selectedCircleId;
    }

    UI.openModal('modal-add-student');
  },

  openInfo() {
    this.updateDashboardStats();
    UI.openModal('modal-info');
  },

  /* ========================================================================
     2. عرض شريط الحلقات والقوائم المنسدلة
     ======================================================================== */

  renderCirclesBar() {
    const container = document.getElementById('dashboard-circles-list');
    if (!container) return;

    const circles = DB.getCircles();
    const allStudents = DB.getStudents({ circleId: 'ALL' });

    // التحقق من أن الحلقة المحددة ما زالت موجودة
    if (
      this.state.selectedCircleId !== 'ALL' &&
      !circles.some((c) => c.id === this.state.selectedCircleId)
    ) {
      this.state.selectedCircleId = 'ALL';
    }

    container.innerHTML = '';

    // زر "جميع الحلقات"
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `circle-chip ${this.state.selectedCircleId === 'ALL' ? 'active' : ''}`;
    allChip.innerHTML = `
      <span>🕌 جميع الحلقات</span>
      <span class="chip-count">${allStudents.length}</span>
    `;
    allChip.addEventListener('click', () => {
      this.state.selectedCircleId = 'ALL';
      this.refreshAll();
    });
    container.appendChild(allChip);

    // أزرار الحلقات المضافة
    circles.forEach((circle) => {
      const count = allStudents.filter((s) => s.circleId === circle.id).length;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `circle-chip ${this.state.selectedCircleId === circle.id ? 'active' : ''}`;
      chip.innerHTML = `
        <span>📖 ${UI.escapeHtml(circle.name)}</span>
        <span class="chip-count">${count}</span>
      `;
      chip.addEventListener('click', () => {
        this.state.selectedCircleId = circle.id;
        this.refreshAll();
      });
      container.appendChild(chip);
    });
  },

  /* ========================================================================
     2.ب نافذتا تعديل وحذف الحلقة (اختيار الحلقة داخل النافذة)
     ======================================================================== */

  // تعبئة قائمة حلقات (select) وتحديد الحلقة المعروضة حالياً إن وُجدت
  fillCircleSelect(selectEl, circles, preferredId) {
    selectEl.innerHTML = '';
    circles.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      selectEl.appendChild(opt);
    });
    if (preferredId && circles.some((c) => c.id === preferredId)) selectEl.value = preferredId;
  },

  refreshAfterCircleChange() {
    this.refreshAll();
    if (window.PointsView) window.PointsView.refreshAll();
    if (window.CardsPDF) window.CardsPDF.refreshAll();
  },

  bindCircleManagementModals() {
    // --- تعديل ---
    const editSelect = document.getElementById('edit-circle-select');
    if (editSelect) editSelect.addEventListener('change', () => this.fillEditCircleFields());

    const editForm = document.getElementById('form-edit-circle');
    if (editForm) {
      editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-circle-select').value;
        const name = document.getElementById('edit-circle-name').value;
        const prefix = document.getElementById('edit-circle-prefix').value;
        try {
          DB.updateCircle(id, { name, prefix });
          UI.closeModal('modal-edit-circle');
          this.refreshAfterCircleChange();
          UI.showToast('تم تحديث الحلقة', 'success');
        } catch (err) {
          UI.showToast(err.message || 'تعذر تعديل الحلقة', 'error');
        }
      });
    }

    // --- حذف ---
    const delSelect = document.getElementById('delete-circle-select');
    if (delSelect) delSelect.addEventListener('change', () => this.refreshDeleteCircleInfo());

    const confirmBtn = document.getElementById('btn-confirm-delete-circle');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const id = document.getElementById('delete-circle-select').value;
        const circle = DB.getCircleById(id);
        if (!circle) return;
        const moveGroup = document.getElementById('delete-circle-move-group');
        const moveToId = moveGroup && moveGroup.style.display !== 'none'
          ? document.getElementById('delete-circle-move-to').value
          : '';
        try {
          DB.deleteCircle(circle.id, moveToId);
          if (this.state.selectedCircleId === circle.id) this.state.selectedCircleId = 'ALL';
          UI.closeModal('modal-delete-circle');
          this.refreshAfterCircleChange();
          UI.showToast(`تم حذف "${circle.name}" بنجاح`, 'warning');
        } catch (err) {
          UI.showToast(err.message || 'تعذر حذف الحلقة', 'error');
        }
      });
    }
  },

  openEditCircle() {
    const circles = DB.getCircles();
    if (circles.length === 0) {
      UI.showToast('لا توجد حلقات لتعديلها', 'warning');
      return;
    }
    this.fillCircleSelect(document.getElementById('edit-circle-select'), circles, this.state.selectedCircleId);
    this.fillEditCircleFields();
    UI.openModal('modal-edit-circle');
  },

  fillEditCircleFields() {
    const circle = DB.getCircleById(document.getElementById('edit-circle-select').value);
    if (!circle) return;
    document.getElementById('edit-circle-name').value = circle.name;
    document.getElementById('edit-circle-prefix').value = circle.prefix || 'QAT';
  },

  openDeleteCircle() {
    const circles = DB.getCircles();
    if (circles.length === 0) {
      UI.showToast('لا توجد حلقات لحذفها', 'warning');
      return;
    }
    this.fillCircleSelect(document.getElementById('delete-circle-select'), circles, this.state.selectedCircleId);
    this.refreshDeleteCircleInfo();
    UI.openModal('modal-delete-circle');
  },

  // يعرض عدد طلاب الحلقة المختارة، ويطلب حلقة لنقلهم إليها إن وُجدوا
  refreshDeleteCircleInfo() {
    const id = document.getElementById('delete-circle-select').value;
    const circle = DB.getCircleById(id);
    const info = document.getElementById('delete-circle-info');
    const moveGroup = document.getElementById('delete-circle-move-group');
    const moveSelect = document.getElementById('delete-circle-move-to');
    const confirmBtn = document.getElementById('btn-confirm-delete-circle');
    if (!circle) return;

    const count = DB.getStudents({ circleId: circle.id }).length;
    const others = DB.getCircles().filter((c) => c.id !== circle.id);

    moveGroup.style.display = 'none';
    confirmBtn.disabled = false;

    if (count === 0) {
      info.textContent = `لا يوجد طلاب في "${circle.name}".`;
    } else if (others.length === 0) {
      info.textContent = `في "${circle.name}" ${count} طالب، ولا توجد حلقة أخرى لنقلهم إليها. أضف حلقة أخرى أولاً.`;
      confirmBtn.disabled = true;
    } else {
      info.textContent = `في "${circle.name}" ${count} طالب، وسيُنقلون إلى الحلقة التي تختارها:`;
      this.fillCircleSelect(moveSelect, others);
      moveGroup.style.display = '';
    }
  },

  populateCircleSelectDropdowns() {
    const circles = DB.getCircles();
    const addSelect = document.getElementById('input-student-circle');
    const editSelect = document.getElementById('edit-student-circle');

    [addSelect, editSelect].forEach((selectEl) => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = '';

      circles.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        selectEl.appendChild(opt);
      });

      if (currentVal && circles.some((c) => c.id === currentVal)) {
        selectEl.value = currentVal;
      }
    });
  },

  /* ========================================================================
     3. عرض شبكة بطاقات الطلاب في اللوحة الرئيسية (الاسم، العمر، المعرّف)
     ======================================================================== */

  renderStudentsGrid() {
    const grid = document.getElementById('dashboard-students-grid');
    if (!grid) return;

    const students = DB.getStudents({
      circleId: this.state.selectedCircleId,
      searchQuery: this.state.searchQuery,
      sortAlphabetically: this.state.sortAlphabetically
    });

    const circlesMap = {};
    DB.getCircles().forEach((c) => {
      circlesMap[c.id] = c.name;
    });

    grid.innerHTML = '';

    if (students.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.innerHTML = `
        <div class="empty-state-icon">🕌</div>
        <h3>لا يوجد طلاب مطابقون للعرض حالياً</h3>
        <p>اضغط على الزر العائم ＋ ثم "إضافة طالب جديد" لتسجيل الطلاب في الحلقة، أو غيّر كلمات البحث.</p>
      `;
      grid.appendChild(emptyDiv);
      return;
    }

    students.forEach((student) => {
      const circleName = circlesMap[student.circleId] || 'غير محدد';
      const card = document.createElement('article');
      card.className = 'student-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `ملف الطالب ${student.name}`);

      // البطاقة تعرض حصراً: الاسم، العمر، والمعرّف (ID) واسم الحلقة دون أي أزرار نقاط
      card.innerHTML = `
        <div class="student-card-header">
          <h3 class="student-name">${UI.escapeHtml(student.name)}</h3>
          <span class="student-id-badge">${UI.escapeHtml(student.id)}</span>
        </div>
        <div class="student-card-meta">
          <span class="meta-pill">🎂 العمر: <strong>${Number(student.age)}</strong> سنة</span>
          <span class="meta-pill">📖 ${UI.escapeHtml(circleName)}</span>
        </div>
      `;

      // عند النقر على البطاقة أو اسم الطالب تفتح نافذة الملف الشخصي لتعديله أو حذفه
      card.addEventListener('click', () => {
        this.openEditStudentModal(student.id);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openEditStudentModal(student.id);
        }
      });

      grid.appendChild(card);
    });
  },

  /* ========================================================================
     4. فتح نافذة تعديل وحذف الطالب (Edit Profile Modal)
     ======================================================================== */

  openEditStudentModal(studentId) {
    const student = DB.getStudentById(studentId);
    if (!student) {
      UI.showToast('لم يتم العثور على بيانات الطالب', 'error');
      return;
    }

    this.populateCircleSelectDropdowns();

    document.getElementById('edit-student-id').value = student.id;
    document.getElementById('edit-student-id-display').textContent = student.id;
    document.getElementById('edit-student-name').value = student.name;
    document.getElementById('edit-student-age').value = student.age;
    document.getElementById('edit-student-phone').value = student.parentPhone || '';

    const circleSelect = document.getElementById('edit-student-circle');
    if (circleSelect) {
      circleSelect.value = student.circleId;
    }

    UI.openModal('modal-edit-student');
  },

  /* ========================================================================
     5. تحديث أرقام نافذة المعلومات (إجمالي الحلقات والطلاب)
     ======================================================================== */

  updateDashboardStats() {
    const totalCirclesEl = document.getElementById('info-total-circles');
    const totalStudentsEl = document.getElementById('info-total-students');
    if (totalCirclesEl) totalCirclesEl.textContent = DB.getCircles().length;
    if (totalStudentsEl) totalStudentsEl.textContent = DB.getStudents({ circleId: 'ALL' }).length;
  }
};

window.StudentsView = StudentsView;
document.addEventListener('DOMContentLoaded', () => {
  StudentsView.init();
});