/**
 * منطق واجهة إدارة النقاط والمراكز حصراً (points.js) - شباب مسجد قطنا
 * يدير:
 * 1. لوحة المراكز التنازلية (Leaderboard) مع الميداليات الثلاث (🥇 🥈 🥉).
 * 2. نظام النافذتين المنبثقتين المتتاليتين لتعديل النقاط الفردية مع السبب الإلزامي وعرض السجل.
 * 3. الإدخال الجماعي للنقاط بواسطة المعرّفات النصية المفصولة بفاصلة (,).
 * 4. تصدير ملف HTML مستقل تفاعلي يحتوي على مراكز الطلاب وشريط بحث للمشاركة الخارجية.
 */

const PointsView = {
  state: {
    selectedCircleId: 'ALL',
    searchQuery: '',
    activeStudentId: null
  },

  init() {
    this.bindEvents();
    this.refreshAll();
  },

  /**
   * تحديث قائمة فلترة الحلقات ولوحة المراكز والنافذة المفتوحة إن وجدت
   */
  refreshAll() {
    this.populateCircleFilter();
    this.renderLeaderboard();

    // إذا كانت نافذة ملخص نقاط طالب مفتوحة حالياً، قم بتحديث بياناتها وسجلها فوراً
    if (this.state.activeStudentId) {
      const overviewModal = document.getElementById('modal-student-points-overview');
      if (overviewModal && overviewModal.classList.contains('active')) {
        this.renderStudentPointsOverview(this.state.activeStudentId);
      }
    }
  },

  /* ========================================================================
     1. ربط الأحداث الخاصة بواجهة النقاط والنوافذ المتتالية
     ======================================================================== */

  bindEvents() {
    // البحث الفوري في قائمة المراكز
    const searchInput = document.getElementById('points-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value;
        this.renderLeaderboard();
      });
    }

    // فلترة المراكز حسب الحلقة
    const circleFilter = document.getElementById('points-circle-filter');
    if (circleFilter) {
      circleFilter.addEventListener('change', (e) => {
        this.state.selectedCircleId = e.target.value;
        this.renderLeaderboard();
      });
    }

    // الزر الأول داخل النافذة المنبثقة الأولى: فتح النافذة الثانية لإضافة نقاط
    const btnOpenAdd = document.getElementById('btn-open-points-action-add');
    if (btnOpenAdd) {
      btnOpenAdd.addEventListener('click', () => {
        this.openSecondPointsActionModal('add');
      });
    }

    // الزر الثاني داخل النافذة المنبثقة الأولى: فتح النافذة الثانية لإزالة نقاط
    const btnOpenDeduct = document.getElementById('btn-open-points-action-deduct');
    if (btnOpenDeduct) {
      btnOpenDeduct.addEventListener('click', () => {
        this.openSecondPointsActionModal('deduct');
      });
    }

    // نموذج النافذة المنبثقة الثانية: تأكيد إضافة/إزالة النقاط الفردية مع السبب الإلزامي
    const singleActionForm = document.getElementById('form-single-points-action');
    if (singleActionForm) {
      singleActionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSinglePointsSubmit();
      });
    }

    // زر فتح نافذة الإدخال الجماعي بواسطة المعرّفات النصية (Batch IDs)
    const btnOpenBatch = document.getElementById('btn-open-batch-ids');
    if (btnOpenBatch) {
      btnOpenBatch.addEventListener('click', () => {
        const form = document.getElementById('form-batch-ids-points');
        if (form) form.reset();
        UI.fillAttendanceCircles('batch');
        UI.openModal('modal-batch-ids-points');
      });
    }

    // معالجة نموذج الإدخال الجماعي بالمعرّفات المفصولة بفاصلة (,)
    const batchForm = document.getElementById('form-batch-ids-points');
    if (batchForm) {
      batchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleBatchIdsSubmit();
      });
    }

    // زر تصدير لوحة المراكز كملف HTML مستقل
    const btnExportHtml = document.getElementById('btn-export-leaderboard-html');
    if (btnExportHtml) {
      btnExportHtml.addEventListener('click', () => {
        this.exportLeaderboardAsHtmlFile();
      });
    }
  },

  /* ========================================================================
     2. عرض لوحة المراكز التنازلية (Leaderboard) مع الميداليات
     ======================================================================== */

  populateCircleFilter() {
    const select = document.getElementById('points-circle-filter');
    if (!select) return;

    const circles = DB.getCircles();
    const currentVal = this.state.selectedCircleId;

    select.innerHTML = '<option value="ALL">جميع الحلقات</option>';
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

  renderLeaderboard() {
    const container = document.getElementById('points-leaderboard-list');
    if (!container) return;

    const rankedStudents = DB.getLeaderboard({
      circleId: this.state.selectedCircleId,
      searchQuery: this.state.searchQuery
    });

    const circlesMap = {};
    DB.getCircles().forEach((c) => {
      circlesMap[c.id] = c.name;
    });

    container.innerHTML = '';

    if (rankedStudents.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.innerHTML = `
        <div class="empty-state-icon">🏆</div>
        <h3>لا توجد بيانات طلاب لعرض المراكز</h3>
        <p>تأكد من إضافة طلاب في اللوحة الرئيسية أو تعديل خيارات البحث والتصفية.</p>
      `;
      container.appendChild(emptyDiv);
      return;
    }

    rankedStudents.forEach((student, index) => {
      // ترتيب كثيف (مثل ألعاب لينكدإن): المتساوون يتشاركون المركز والتالي يأخذ المركز التالي مباشرة (1،1،2،3،3)
      const rankNumber = new Set(rankedStudents.filter((x) => x.points > student.points).map((x) => x.points)).size + 1;
      const circleName = circlesMap[student.circleId] || 'غير محدد';

      let rankClass = '';
      let rankBadgeContent = String(rankNumber);

      if (rankNumber === 1 && student.points > 0) {
        rankClass = 'rank-1';
        rankBadgeContent = '🥇';
      } else if (rankNumber === 2 && student.points > 0) {
        rankClass = 'rank-2';
        rankBadgeContent = '🥈';
      } else if (rankNumber === 3 && student.points > 0) {
        rankClass = 'rank-3';
        rankBadgeContent = '🥉';
      }

      const row = document.createElement('div');
      row.className = `leaderboard-row ${rankClass}`;
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `المركز ${rankNumber}: ${student.name}، النقاط: ${student.points}`);

      row.innerHTML = `
        <div class="rank-info">
          <div class="rank-badge" title="المركز ${rankNumber}">${rankBadgeContent}</div>
          <div class="student-rank-details">
            <h4>${UI.escapeHtml(student.name)}</h4>
            <p>
              <span class="student-id-badge">${UI.escapeHtml(student.id)}</span>
              <span>📖 ${UI.escapeHtml(circleName)}</span>
              <span>• المركز #${rankNumber}</span>
            </p>
          </div>
        </div>
        <div class="points-score-box">
          <span class="points-num">${Number(student.points)}</span>
          <span class="points-label">نقطة</span>
        </div>
      `;

      // عند الضغط على اسم/صف الطالب في واجهة النقاط تفتح النافذة المنبثقة الأولى
      row.addEventListener('click', () => {
        this.openStudentPointsOverviewModal(student.id);
      });

      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openStudentPointsOverviewModal(student.id);
        }
      });

      container.appendChild(row);
    });
  },

  /* ========================================================================
     3. نظام النافذتين المنبثقتين المتتاليتين لتعديل النقاط الفردية
     ======================================================================== */

  /**
   * فتح النافذة الأولى: تعرض اسم الطالب، إجمالي نقاطه، سجل النقاط، وزري (إضافة / إزالة)
   */
  openStudentPointsOverviewModal(studentId) {
    this.state.activeStudentId = studentId;
    const rendered = this.renderStudentPointsOverview(studentId);
    if (rendered) {
      UI.openModal('modal-student-points-overview');
    }
  },

  renderStudentPointsOverview(studentId) {
    const student = DB.getStudentById(studentId);
    if (!student) {
      UI.showToast('تعذر العثور على بيانات الطالب', 'error');
      return false;
    }

    document.getElementById('points-modal-student-id').value = student.id;
    document.getElementById('points-modal-student-name').textContent = `سجل نقاط: ${student.name}`;
    document.getElementById('points-modal-total-score').textContent = `${Number(student.points)} نقطة`;
    document.getElementById('points-modal-id-badge').textContent = student.id;

    const logContainer = document.getElementById('points-modal-log-list');
    if (logContainer) {
      logContainer.innerHTML = '';
      const logs = Array.isArray(student.pointsLog) ? student.pointsLog : [];

      if (logs.length === 0) {
        logContainer.innerHTML = `
          <div style="text-align: center; padding: 1.4rem 0.5rem; color: var(--text-secondary); font-size: 0.88rem;">
            لا توجد عمليات مسجلة في سجل هذا الطالب حتى الآن.
          </div>
        `;
      } else {
        logs.forEach((entry) => {
          const isPositive = Number(entry.change) >= 0;
          const formattedAmount = isPositive ? `+${entry.change}` : `${entry.change}`;
          const item = document.createElement('div');
          item.className = 'log-item';
          item.innerHTML = `
            <div>
              <div class="log-reason">${UI.escapeHtml(entry.reason)}</div>
              <div class="log-date">🕒 ${UI.escapeHtml(UI.formatDateTimeAr(entry.timestamp))}</div>
            </div>
            <span class="log-amount ${isPositive ? 'positive' : 'negative'}">${formattedAmount}</span>
            ${entry.id && !entry.reverted && !entry.revertOf
              ? `<button type="button" class="btn btn-sm btn-secondary" data-undo-log="${UI.escapeHtml(entry.id)}" style="margin-inline-start:.5rem;">↩️ تراجع</button>`
              : ''}
          `;
          if (entry.reverted) item.style.opacity = '0.55';
          const undoBtn = item.querySelector('[data-undo-log]');
          if (undoBtn) {
            undoBtn.addEventListener('click', () => {
              if (!window.confirm(`التراجع عن (${formattedAmount}) بسبب "${entry.reason}"؟`)) return;
              try {
                DB.revertLogEntry(student.id, entry.id);
                this.renderStudentPointsOverview(student.id);
                this.refreshAll();
                UI.showToast('تم التراجع عن العملية', 'success');
              } catch (err) {
                UI.showToast(err.message || 'تعذر التراجع', 'error');
              }
            });
          }
          logContainer.appendChild(item);
        });
      }
    }

    return true;
  },

  /**
   * فتح النافذة المنبثقة الثانية المتتالية فوق الأولى لتحديد عدد النقاط والسبب الإلزامي
   */
  openSecondPointsActionModal(operationType) {
    const studentId = this.state.activeStudentId || document.getElementById('points-modal-student-id').value;
    const student = DB.getStudentById(studentId);
    if (!student) return;

    const isDeduct = operationType === 'deduct';
    document.getElementById('single-points-operation-type').value = isDeduct ? 'deduct' : 'add';

    const titleEl = document.getElementById('points-action-modal-title');
    const submitBtn = document.getElementById('btn-submit-single-points');
    const amountInput = document.getElementById('input-single-points-amount');
    const reasonInput = document.getElementById('input-single-points-reason');

    if (titleEl) {
      titleEl.textContent = isDeduct
        ? `➖ إزالة نقاط من الطالب: ${student.name}`
        : `➕ إضافة نقاط للطالب: ${student.name}`;
    }

    if (submitBtn) {
      submitBtn.className = isDeduct ? 'btn btn-danger' : 'btn btn-primary';
      submitBtn.textContent = isDeduct ? 'تأكيد خصم النقاط' : 'تأكيد إضافة النقاط';
    }

    if (amountInput) amountInput.value = 5;
    if (reasonInput) {
      reasonInput.value = '';
      reasonInput.placeholder = isDeduct
        ? 'مثال: غياب بدون عذر / تأخر عن الحلقة'
        : 'مثال: تسميع متقن / التزام بالحضور والهدوء';
    }

    UI.openModal('modal-points-action-form');
  },

  /**
   * تنفيذ عملية الإضافة أو الخصم من النافذة الثانية وتحديث الرصيد والسجل فوراً
   */
  handleSinglePointsSubmit() {
    const studentId = this.state.activeStudentId || document.getElementById('points-modal-student-id').value;
    const operationType = document.getElementById('single-points-operation-type').value;
    const amount = document.getElementById('input-single-points-amount').value;
    const reason = document.getElementById('input-single-points-reason').value;

    try {
      const result = DB.modifyStudentPoints(studentId, amount, operationType, reason);

      // إغلاق النافذة الثانية فقط وتحديث النافذة الأولى ولوحة المراكز فوراً
      UI.closeModal('modal-points-action-form');
      this.renderStudentPointsOverview(studentId);
      this.renderLeaderboard();

      const signText = result.logEntry.change >= 0 ? `+${result.logEntry.change}` : `${result.logEntry.change}`;
      UI.showToast(
        `تم تحديث نقاط "${result.student.name}" (${signText}) • الرصيد: ${result.student.points}`,
        result.logEntry.change >= 0 ? 'success' : 'warning',
        2200
      );
    } catch (err) {
      UI.showToast(err.message || 'تعذر تحديث النقاط', 'error');
    }
  },

  /* ========================================================================
     4. الإدخال الجماعي للنقاط بواسطة المعرّفات المفصولة بفاصلة (Batch IDs)
     ======================================================================== */

  /**
   * تحويل المعرّف المدخل إلى الصيغة القياسية (يدعم إدخال "QAT-1001" أو "1001" فقط)
   */
  normalizeInputStudentId(rawToken) {
    const cleaned = String(rawToken || '').trim().toUpperCase();
    if (!cleaned) return '';
    // الأرقام وحدها (مثل 1005) تُحلّ داخل DB حسب الرقم التسلسلي للمعرّف
    return cleaned;
  },

  handleBatchIdsSubmit() {
    const cfg = UI.readAttendanceFields('batch');
    const rawText = document.getElementById('batch-ids-textarea').value;

    // فصل المعرّفات بالفاصلة (,) أو (،) أو الأسطر أو المسافات
    const tokens = String(rawText || '')
      .split(/[,،\s]+/)
      .map((t) => this.normalizeInputStudentId(t))
      .filter(Boolean);

    try {
      const preview = DB.applyAttendanceSession({ ...cfg, presentTokens: tokens, dryRun: true });
      const lines = [];
      if (cfg.presentPoints > 0) {
        lines.push(`➕ ${cfg.presentPoints} نقطة لـ ${preview.presentCount} حاضر (السبب: ${cfg.presentReason})`);
      }
      if (cfg.absentPoints > 0) {
        lines.push(`➖ ${cfg.absentPoints} نقطة من ${preview.absentCount} غائب (السبب: ${cfg.absentReason})`);
      }
      if (preview.notFoundIds.length) {
        lines.push(`⚠️ معرّفات غير موجودة (تُتجاهل): ${preview.notFoundIds.join(', ')}`);
      }
      if (!window.confirm('تأكيد العملية:\n' + lines.join('\n'))) return;

      const result = DB.applyAttendanceSession({ ...cfg, presentTokens: tokens });
      UI.closeModal('modal-batch-ids-points');
      this.renderLeaderboard();
      UI.showToast(`تم: ${result.presentCount} حاضر • ${result.absentCount} غائب`, 'success', 3000);
    } catch (err) {
      UI.showToast(err.message || 'تعذر تنفيذ العملية الجماعية', 'error');
    }
  },

  /* ========================================================================
     5. تصدير لوحة المراكز كملف HTML مستقل تفاعلي للمشاركة الخارجية
     ======================================================================== */

  exportLeaderboardAsHtmlFile() {
    const rankedStudents = DB.getLeaderboard({
      circleId: this.state.selectedCircleId,
      searchQuery: ''
    });

    if (rankedStudents.length === 0) {
      UI.showToast('لا يوجد طلاب لتصدير قائمة المراكز', 'warning');
      return;
    }

    const circlesMap = {};
    DB.getCircles().forEach((c) => {
      circlesMap[c.id] = c.name;
    });

    const selectedCircleObj =
      this.state.selectedCircleId === 'ALL'
        ? null
        : DB.getCircleById(this.state.selectedCircleId);

    const reportTitle = selectedCircleObj
      ? `لوحة المراكز والنقاط: ${selectedCircleObj.name}`
      : 'لوحة المراكز والنقاط لجميع الحلقات';

    const exportDate = UI.formatDateTimeAr(new Date().toISOString());

    const rowsHtml = rankedStudents
      .map((st, idx) => {
        // ترتيب كثيف: 10,10,8,7,7 ← 1,1,2,3,3
        const rank = new Set(rankedStudents.filter((x) => x.points > st.points).map((x) => x.points)).size + 1;
        const circleName = circlesMap[st.circleId] || 'غير محدد';
        let medal = `#${rank}`;
        let rowClass = '';
        if (rank === 1 && st.points > 0) {
          medal = '🥇 المركز الأول';
          rowClass = 'top-1';
        } else if (rank === 2 && st.points > 0) {
          medal = '🥈 المركز الثاني';
          rowClass = 'top-2';
        } else if (rank === 3 && st.points > 0) {
          medal = '🥉 المركز الثالث';
          rowClass = 'top-3';
        }

        return `
          <tr class="student-row ${rowClass}" data-search="${UI.escapeHtml(st.name.toLowerCase())} ${UI.escapeHtml(circleName.toLowerCase())}">
            <td class="rank-cell">${medal}</td>
            <td class="name-cell">
              <strong>${UI.escapeHtml(st.name)}</strong>
            </td>
            <td>${UI.escapeHtml(circleName)}</td>
            <td class="points-cell"><span>${Number(st.points)}</span> نقطة</td>
          </tr>
        `;
      })
      .join('');

    const standaloneHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${UI.escapeHtml(reportTitle)} | شباب مسجد قطنا</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Tajawal", "Cairo", "Segoe UI", Tahoma, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      line-height: 1.6;
      padding: 1.5rem 1rem 3rem;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
    }
    .header-card {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #ffffff;
      border-radius: 16px;
      padding: 1.75rem 1.5rem;
      text-align: center;
      box-shadow: 0 10px 25px rgba(5, 150, 105, 0.2);
      margin-bottom: 1.5rem;
    }
    .header-card h1 { font-size: 1.75rem; font-weight: 800; line-height: 1.35; }
    .header-card .org { font-size: 1.2rem; font-weight: 600; opacity: 0.95; margin: 0.1rem 0 1rem; }
    .header-card h2 { display: inline-block; font-size: 1rem; font-weight: 600; background: rgba(255, 255, 255, 0.16); border-radius: 999px; padding: 0.3rem 1.1rem; margin-bottom: 0.65rem; }
    .header-card .meta { font-size: 0.85rem; opacity: 0.85; }
    .search-bar {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 0.85rem;
      margin-bottom: 1.25rem;
      display: flex;
      gap: 0.6rem;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05);
    }
    .search-bar input {
      flex: 1;
      padding: 0.65rem 1rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.95rem;
      font-family: inherit;
    }
    .search-bar input:focus {
      outline: none;
      border-color: #059669;
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
    }
    .search-bar button {
      background: #059669;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 0 1.25rem;
      font-family: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .search-bar button:hover { background: #10b981; }
    .table-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
    }
    thead {
      background: #064e3b;
      color: #ecfdf5;
    }
    th, td {
      padding: 0.9rem 1rem;
      border-bottom: 1px solid #e2e8f0;
    }
    tr.top-1 { background-color: rgba(234, 179, 8, 0.12); }
    tr.top-2 { background-color: rgba(148, 163, 184, 0.14); }
    tr.top-3 { background-color: rgba(180, 83, 9, 0.10); }
    .rank-cell { font-weight: 800; white-space: nowrap; }
    .name-cell { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .points-cell span {
      font-weight: 800;
      font-size: 1.15rem;
      color: #059669;
    }
    .no-results {
      display: none;
      padding: 2rem;
      text-align: center;
      color: #64748b;
      font-weight: 600;
    }
    @media (max-width: 640px) {
      th, td { padding: 0.7rem 0.6rem; font-size: 0.88rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <h1>إدارة الحلقات القرآنية</h1>
      <div class="org">شباب مسجد قطنا</div>
      <h2>${UI.escapeHtml(reportTitle)}</h2>
      <div class="meta">تاريخ التصدير: ${UI.escapeHtml(exportDate)} | إجمالي الطلاب: ${rankedStudents.length}</div>
    </div>

    <div class="search-bar">
      <input type="search" id="searchInput" placeholder="ابحث عن طالب بالاسم أو اسم الحلقة..." />
      <button type="button" id="searchBtn">بحث</button>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>المركز</th>
            <th>اسم الطالب</th>
            <th>الحلقة القرآنية</th>
            <th>رصيد النقاط</th>
          </tr>
        </thead>
        <tbody id="leaderboardBody">
          ${rowsHtml}
        </tbody>
      </table>
      <div id="noResults" class="no-results">لا يوجد طالب مطابق لبحثك.</div>
    </div>
  </div>

  <script>
    (function() {
      var input = document.getElementById('searchInput');
      var btn = document.getElementById('searchBtn');
      var rows = Array.prototype.slice.call(document.querySelectorAll('.student-row'));
      var noResults = document.getElementById('noResults');

      function filterRows() {
        var q = (input.value || '').trim().toLowerCase();
        var visibleCount = 0;
        rows.forEach(function(row) {
          var hay = row.getAttribute('data-search') || '';
          var match = !q || hay.indexOf(q) !== -1;
          row.style.display = match ? '' : 'none';
          if (match) visibleCount++;
        });
        noResults.style.display = visibleCount === 0 ? 'block' : 'none';
      }

      input.addEventListener('input', filterRows);
      btn.addEventListener('click', filterRows);
    })();
  </script>
</body>
</html>`;

    const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const datePart = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `مراكز_طلاب_حلقات_مسجد_قطنا_${datePart}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    UI.showToast('تم تصدير وتحميل ملف المراكز (.html) بنجاح!', 'success', 2500);
  }
};

window.PointsView = PointsView;
document.addEventListener('DOMContentLoaded', () => {
  PointsView.init();
});