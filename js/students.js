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
    // زر فتح نافذة إضافة حلقة جديدة
    const openAddCircleBtn = document.getElementById('btn-open-add-circle');
    if (openAddCircleBtn) {
      openAddCircleBtn.addEventListener('click', () => {
        const form = document.getElementById('form-add-circle');
        if (form) form.reset();
        UI.openModal('modal-add-circle');
      });
    }

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

    // زر حذف الحلقة المحددة حالياً
    const deleteCircleBtn = document.getElementById('btn-delete-active-circle');
    if (deleteCircleBtn) {
      deleteCircleBtn.addEventListener('click', () => {
        if (this.state.selectedCircleId === 'ALL') return;
        const circle = DB.getCircleById(this.state.selectedCircleId);
        if (!circle) return;

        const studentCount = DB.getStudents({ circleId: circle.id }).length;
        let moveToId = '';
        if (studentCount > 0) {
          const others = DB.getCircles().filter((c) => c.id !== circle.id);
          if (others.length === 0) {
            UI.showToast('لا يمكن حذف آخر حلقة وفيها طلاب. أضف حلقة أخرى أولاً.', 'warning', 3500);
            return;
          }
          const list = others.map((c, i) => `${i + 1}) ${c.name}`).join('\n');
          const answer = window.prompt(`في "${circle.name}" ${studentCount} طالب. اكتب رقم الحلقة التي سيُنقلون إليها:\n${list}`);
          if (answer === null) return;
          const chosen = others[parseInt(answer, 10) - 1];
          if (!chosen) {
            UI.showToast('رقم غير صحيح، لم يُحذف شيء', 'error');
            return;
          }
          moveToId = chosen.id;
        }
        if (!window.confirm(`حذف "${circle.name}" نهائياً؟`)) return;

        DB.deleteCircle(circle.id, moveToId);
        this.state.selectedCircleId = 'ALL';
        this.refreshAll();
        if (window.PointsView) window.PointsView.refreshAll();
        if (window.CardsPDF) window.CardsPDF.refreshAll();
        UI.showToast(`تم حذف "${circle.name}" بنجاح`, 'warning');
      });
    }

    // زر فتح نافذة إضافة طالب جديد
    const openAddStudentBtn = document.getElementById('btn-open-add-student');
    if (openAddStudentBtn) {
      openAddStudentBtn.addEventListener('click', () => {
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
      });
    }

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
     2. عرض شريط الحلقات والقوائم المنسدلة
     ======================================================================== */

  renderCirclesBar() {
    const container = document.getElementById('dashboard-circles-list');
    const deleteCircleBtn = document.getElementById('btn-delete-active-circle');
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

    // إظهار زر حذف الحلقة فقط عند تحديد حلقة معينة
    if (deleteCircleBtn) {
      // زر "تعديل الحلقة" يُنشأ مرة واحدة بجانب زر الحذف
      let editBtn = document.getElementById('btn-edit-active-circle');
      if (!editBtn) {
        editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.id = 'btn-edit-active-circle';
        editBtn.className = deleteCircleBtn.className.replace(/danger[\w-]*/g, 'secondary');
        editBtn.textContent = '✏️ تعديل الحلقة';
        editBtn.addEventListener('click', () => this.editActiveCircle());
        deleteCircleBtn.parentNode.insertBefore(editBtn, deleteCircleBtn);
      }
      const display = this.state.selectedCircleId === 'ALL' ? 'none' : 'inline-flex';
      deleteCircleBtn.style.display = display;
      editBtn.style.display = display;
    }
  },

  // تعديل اسم الحلقة المحددة ورمز معرّفها (الرمز يخص الطلاب الجدد فقط)
  editActiveCircle() {
    const circle = DB.getCircleById(this.state.selectedCircleId);
    if (!circle) return;
    const name = window.prompt('اسم الحلقة:', circle.name);
    if (name === null) return;
    const prefix = window.prompt('رمز المعرّف للطلاب الجدد (2–4 أحرف/أرقام إنجليزية). المعرّفات القديمة لا تتغير:', circle.prefix || 'QAT');
    if (prefix === null) return;
    try {
      DB.updateCircle(circle.id, { name, prefix });
      this.refreshAll();
      if (window.PointsView) window.PointsView.refreshAll();
      UI.showToast('تم تحديث الحلقة', 'success');
    } catch (err) {
      UI.showToast(err.message || 'تعذر تعديل الحلقة', 'error');
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
        <p>اضغط على زر "إضافة طالب جديد" في الأعلى لتسجيل الطلاب في الحلقة أو غيّر كلمات البحث.</p>
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
     5. تحديث بطاقات الإحصائيات العلوية في اللوحة الرئيسية
     ======================================================================== */

  updateDashboardStats() {
    const totalCirclesEl = document.getElementById('stat-total-circles');
    const totalStudentsEl = document.getElementById('stat-total-students');
    const filteredStudentsEl = document.getElementById('stat-filtered-students');

    const circlesCount = DB.getCircles().length;
    const allStudentsCount = DB.getStudents({ circleId: 'ALL' }).length;
    const filteredCount = DB.getStudents({
      circleId: this.state.selectedCircleId,
      searchQuery: this.state.searchQuery
    }).length;

    if (totalCirclesEl) totalCirclesEl.textContent = circlesCount;
    if (totalStudentsEl) totalStudentsEl.textContent = allStudentsCount;
    if (filteredStudentsEl) filteredStudentsEl.textContent = filteredCount;
  }
};

window.StudentsView = StudentsView;
document.addEventListener('DOMContentLoaded', () => {
  StudentsView.init();
});