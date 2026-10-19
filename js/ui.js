/**
 * وحدة التحكم بواجهة المستخدم (ui.js) - شباب مسجد قطنا
 * مسؤولة عن: التبويبات، النوافذ المنبثقة (Modals)، الثيمات الخضراء الثلاثة،
 * الوضع الليلي/النهاري، إشعارات Toast السريعة، النسخ الاحتياطي TXT، وتسجيل Service Worker.
 */

const UI = {
  /* ===== حقول الحضور والغياب المشتركة (الماسح + الإدخال اليدوي) ===== */
  mountAttendanceFields(prefix) {
    const host = document.getElementById(`${prefix}-attendance-settings`);
    if (!host) return;
    const group = (id, label, type, extra) =>
      `<div class="form-group" style="margin-bottom: 0;"><label class="form-label" for="${prefix}-${id}">${label}</label><input id="${prefix}-${id}" class="form-control" ${type} ${extra}></div>`;
    host.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="${prefix}-circle">الحلقة (لتحديد الغائبين) *</label>
        <select id="${prefix}-circle" class="form-control"></select>
      </div>
      <div style="background: var(--primary-soft); border: 1px solid var(--primary-border); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.75rem;">
        <strong>✅ الحاضرون: إضافة نقاط</strong>
        <div class="control-grid" style="margin-top: 0.5rem;">
          ${group('present-amount', 'عدد النقاط', 'type="number" min="0" max="1000"', 'value="5"')}
          ${group('present-reason', 'السبب (يُدرج لكل حاضر)', 'type="text"', 'value="حضور"')}
        </div>
      </div>
      <div style="background: rgba(220,38,38,0.08); border: 1px solid rgba(220,38,38,0.3); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.75rem;">
        <strong>❌ الغائبون: خصم نقاط (اتركها 0 لعدم الخصم)</strong>
        <div class="control-grid" style="margin-top: 0.5rem;">
          ${group('absent-amount', 'عدد النقاط المخصومة', 'type="number" min="0" max="1000"', 'value="0"')}
          ${group('absent-reason', 'السبب (يُدرج لكل غائب)', 'type="text"', 'value="غياب"')}
        </div>
      </div>`;
    this.fillAttendanceCircles(prefix);
  },

  /** نافذة اختيار طريقة الاستيراد (تُبنى برمجياً): تعيد 'merge' أو 'replace' أو null عند الإلغاء */
  askImportMode(imported) {
    const cur = DB.getData();
    let modal = document.getElementById('modal-import-choice');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'modal-import-choice';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `<div class="modal-box">
        <div class="modal-header"><h3 class="modal-title">⬆️ استيراد نسخة احتياطية</h3>
          <button type="button" class="modal-close" data-close-modal="modal-import-choice">&times;</button></div>
        <div class="modal-body"><p id="import-choice-summary" style="line-height:1.9;margin:0;"></p></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-import-cancel">إلغاء</button>
          <button type="button" class="btn btn-danger" id="btn-import-replace">♻️ استبدال الكل</button>
          <button type="button" class="btn btn-primary" id="btn-import-merge">🔗 دمج مع الحالي</button>
        </div></div>`;
      document.body.appendChild(modal);
    }
    modal.querySelector('#import-choice-summary').innerHTML =
      `الملف: <strong>${imported.circles.length}</strong> حلقة و<strong>${imported.students.length}</strong> طالب.<br>` +
      `بياناتك الحالية: <strong>${cur.circles.length}</strong> حلقة و<strong>${cur.students.length}</strong> طالب.<br>` +
      `<small>الدمج يُبقي بياناتك ويضيف الجديد فقط. الاستبدال يمسح كل شيء ويضع محتوى الملف.</small>`;
    return new Promise((resolve) => {
      const done = (mode) => { this.closeModal('modal-import-choice'); resolve(mode); };
      modal.querySelector('#btn-import-merge').onclick = () => done('merge');
      modal.querySelector('#btn-import-cancel').onclick = () => done(null);
      modal.querySelector('#btn-import-replace').onclick = () => {
        if (window.confirm('سيتم مسح كل البيانات الحالية نهائياً واستبدالها بالملف. هل أنت متأكد؟')) done('replace');
      };
      this.openModal('modal-import-choice');
    });
  },

  fillAttendanceCircles(prefix) {
    const sel = document.getElementById(`${prefix}-circle`);
    if (!sel) return;
    const current = sel.value;
    const circles = DB.getCircles();
    sel.innerHTML = '<option value="">— اختر الحلقة —</option>';
    circles.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    if (current && circles.some((c) => c.id === current)) sel.value = current;
    else if (circles.length === 1) sel.value = circles[0].id;
  },

  readAttendanceFields(prefix) {
    const val = (id) => (document.getElementById(`${prefix}-${id}`) || {}).value || '';
    const amt = (v) => Math.abs(Number(v)) || 0;
    return {
      circleId: val('circle'),
      presentPoints: amt(val('present-amount')),
      presentReason: val('present-reason').trim(),
      absentPoints: amt(val('absent-amount')),
      absentReason: val('absent-reason').trim()
    };
  },

  /**
   * تهيئة كافة عناصر الواجهة والأحداث العامة
   */
  init() {
    this.applySavedThemeAndMode();
    this.bindNavigationTabs();
    this.bindModalCloseEvents();
    this.bindThemeAndModeControls();
    this.bindBackupExportImport();
    this.mountAttendanceFields('qr');
    this.mountAttendanceFields('batch');
    this.registerServiceWorker();
  },

  /* ========================================================================
     1. إدارة الثيمات الخضراء والوضع الليلي/النهاري (Themes & Dark/Light Mode)
     ======================================================================== */

  applySavedThemeAndMode() {
    const settings = DB.getSettings();
    const theme = settings.theme || 'emerald';
    const mode = settings.mode || 'light';

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', mode);

    // تحديث لون شريط المتصفح في الجوال بحسب الثيم المختار
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const themeColors = {
        emerald: '#059669',
        forest: '#15803d',
        olive: '#4d7c0f',
        sage: '#3d7a5a',
        mint: '#247d5d',
        moss: '#4a7a3a',
        pine: '#1f6f5c',
        mist: '#2f855a'
      };
      themeMeta.setAttribute('content', themeColors[theme] || '#059669');
    }

    // تحديث حالة أزرار اختيار الثيم في قسم الإعدادات
    const themeBtns = document.querySelectorAll('.theme-option-btn');
    themeBtns.forEach((btn) => {
      const choice = btn.getAttribute('data-theme-choice');
      btn.classList.toggle('active', choice === theme);
    });

    // تحديث نص الوضع الحالي
    const modeLabel = document.getElementById('current-mode-label');
    if (modeLabel) {
      modeLabel.textContent =
        mode === 'dark' ? 'الوضع الحالي: ليلي 🌙' : 'الوضع الحالي: نهاري ☀️';
    }
  },

  setTheme(themeName) {
    const validThemes = ['emerald', 'forest', 'olive', 'sage', 'mint', 'moss', 'pine', 'mist'];
    const selected = validThemes.includes(themeName) ? themeName : 'emerald';
    DB.updateSettings({ theme: selected });
    this.applySavedThemeAndMode();

    const namesAr = {
      emerald: 'الأخضر الزمردي',
      forest: 'أخضر الغابات',
      olive: 'الأخضر الزيتوني الهادئ',
      sage: 'سيج وجرافيت',
      mint: 'نعناع وحجر',
      moss: 'طحلب وفحم',
      pine: 'صنوبر وفضي',
      mist: 'تدرج الضباب'
    };
    this.showToast(`تم تفعيل ثيم: ${namesAr[selected]}`, 'success');
  },

  toggleDarkMode() {
    const settings = DB.getSettings();
    const nextMode = settings.mode === 'dark' ? 'light' : 'dark';
    DB.updateSettings({ mode: nextMode });
    this.applySavedThemeAndMode();
    this.showToast(
      nextMode === 'dark' ? 'تم التبديل إلى الوضع الليلي 🌙' : 'تم التبديل إلى الوضع النهاري ☀️',
      'success'
    );
  },

  bindThemeAndModeControls() {
    const toggleModeBtn = document.getElementById('btn-toggle-dark-mode');
    if (toggleModeBtn) {
      toggleModeBtn.addEventListener('click', () => {
        this.toggleDarkMode();
      });
    }

    const themeBtns = document.querySelectorAll('.theme-option-btn');
    themeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosenTheme = btn.getAttribute('data-theme-choice');
        if (chosenTheme) {
          this.setTheme(chosenTheme);
        }
      });
    });
  },

  /* ========================================================================
     2. التنقل بين الأقسام والتبويبات (Tabs Navigation)
     ======================================================================== */

  bindNavigationTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-target');
        if (targetId) {
          this.switchTab(targetId);
        }
      });
    });
  },

  switchTab(targetSectionId) {
    // تحديث التبويب النشط
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-target') === targetSectionId);
    });

    // إظهار القسم المطلوب وإخفاء البقية
    const sections = document.querySelectorAll('.view-section');
    sections.forEach((sec) => {
      sec.classList.toggle('active', sec.id === targetSectionId);
    });

    // إيقاف كاميرا الـ QR تلقائياً في حال غادر المستخدم واجهة النقاط
    if (targetSectionId !== 'view-points' && window.QRScanner && typeof window.QRScanner.stopCamera === 'function') {
      window.QRScanner.stopCamera();
    }

    // تحديث بيانات القسم المفتوح فوراً لضمان التزامن الكامل
    if (targetSectionId === 'view-dashboard' && window.StudentsView) {
      window.StudentsView.refreshAll();
    } else if (targetSectionId === 'view-points' && window.PointsView) {
      window.PointsView.refreshAll();
    } else if (targetSectionId === 'view-cards' && window.CardsPDF) {
      window.CardsPDF.refreshAll();
    }
  },

  /* ========================================================================
     3. التحكم بالنوافذ المنبثقة (Modals Management - يدعم النافذتين المتتاليتين)
     ======================================================================== */

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    // تركيز تلقائي على أول حقل إدخال داخل النافذة لسرعة الاستخدام
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type="hidden"]), textarea, select');
      if (firstInput) {
        firstInput.focus();
      }
    }, 60);
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  },

  bindModalCloseEvents() {
    // الإغلاق عبر الأزرار التي تحمل سمة data-close-modal
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close-modal]');
      if (closeBtn) {
        const modalId = closeBtn.getAttribute('data-close-modal');
        this.closeModal(modalId);
        if (modalId === 'modal-qr-scanner' && window.QRScanner) {
          window.QRScanner.onScannerModalClosed();
        }
        return;
      }

      // الإغلاق عند النقر على الخلفية المعتمة (Overlay) مباشرة
      if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
        const modalId = e.target.id;
        this.closeModal(modalId);
        if (modalId === 'modal-qr-scanner' && window.QRScanner) {
          window.QRScanner.onScannerModalClosed();
        }
      }
    });

    // الإغلاق بزر Escape (يغلق النافذة العلوية المستوى 2 أولاً إن وجدت)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const level2Modal = document.querySelector('.modal-overlay.modal-level-2.active');
        if (level2Modal) {
          this.closeModal(level2Modal.id);
          return;
        }
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) {
          const modalId = activeModal.id;
          this.closeModal(modalId);
          if (modalId === 'modal-qr-scanner' && window.QRScanner) {
            window.QRScanner.onScannerModalClosed();
          }
        }
      }
    });
  },

  /* ========================================================================
     4. إشعارات Toast السفلية الفورية غير المعطلة للعمل (2000ms افتراضياً)
     ======================================================================== */

  showToast(message, type = 'success', duration = 2000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    if (type === 'error') {
      toast.classList.add('toast-error');
    } else if (type === 'warning') {
      toast.classList.add('toast-warning');
    }

    const icons = {
      success: '✅',
      error: '⚠️',
      warning: '🔔'
    };

    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    const iconSpan = document.createElement('span');
    iconSpan.textContent = icons[type] || '✅';

    toast.appendChild(textSpan);
    toast.appendChild(iconSpan);
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.18s ease-in';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 180);
    }, duration);
  },

  /* ========================================================================
     5. النسخ الاحتياطي وتصدير/استيراد قاعدة البيانات (.txt)
     ======================================================================== */

  bindBackupExportImport() {
    const exportBtn = document.getElementById('btn-export-backup-txt');
    const triggerImportBtn = document.getElementById('btn-trigger-import-txt');
    const fileInput = document.getElementById('input-import-backup-txt');

    // تصدير قاعدة البيانات كملف نصي .txt عبر Blob
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        try {
          const jsonString = DB.exportDatabaseAsJsonString();
          const blob = new Blob([jsonString], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);

          const datePart = new Date().toISOString().slice(0, 10);
          const link = document.createElement('a');
          link.href = url;
          link.download = `نسخة_احتياطية_حلقات_مسجد_قطنا_${datePart}.txt`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          this.showToast('تم تحميل ملف النسخة الاحتياطية (.txt) بنجاح', 'success', 2500);
        } catch (err) {
          this.showToast(err.message || 'حدث خطأ أثناء تصدير البيانات', 'error', 3000);
        }
      });
    }

    // فتح نافذة اختيار ملف .txt المخفي
    if (triggerImportBtn && fileInput) {
      triggerImportBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          try {
            const imported = DB.parseBackupString(String(loadEvent.target.result || ''));
            this.askImportMode(imported).then((mode) => {
              if (!mode) return;
              try {
                let msg = 'تم استبدال البيانات بالكامل';
                if (mode === 'replace') {
                  DB.replaceAllData(imported);
                } else {
                  const r = DB.mergeImportedData(imported);
                  msg = `تم الدمج: +${r.addedStudents} طالب، +${r.addedCircles} حلقة` +
                    (r.skippedDuplicates ? ` • ${r.skippedDuplicates} مكرر تم تخطيه` : '') +
                    (r.renumbered ? ` • ${r.renumbered} أُعطوا معرّفات جديدة` : '');
                }
                this.applySavedThemeAndMode();
                if (window.StudentsView) window.StudentsView.refreshAll();
                if (window.PointsView) window.PointsView.refreshAll();
                if (window.CardsPDF) window.CardsPDF.refreshAll();
                this.showToast(msg, 'success', 4500);
              } catch (err) {
                this.showToast(err.message || 'فشل تطبيق الاستيراد', 'error', 3500);
              }
            });
          } catch (err) {
            this.showToast(err.message || 'فشل استيراد الملف النصي', 'error', 3500);
          }
        };
        reader.onerror = () => {
          this.showToast('تعذر قراءة الملف المرفوع', 'error', 3000);
        };
        reader.readAsText(file, 'UTF-8');
      });
    }
  },

  /* ========================================================================
     6. تسجيل الـ Service Worker للعمل أوفلاين (PWA Offline-First)
     ======================================================================== */

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js')
          .then((reg) => {
            console.log('[PWA] تم تسجيل Service Worker بنجاح:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] تعذر تسجيل Service Worker (تأكد من التشغيل عبر HTTPS أو localhost):', err);
          });
      });
    }
  },

  /* ========================================================================
     7. دوال مساعدة لتنسيق التاريخ وحماية النصوص (Helpers)
     ======================================================================== */

  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  formatDateTimeAr(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('ar-SY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  }
};

window.UI = UI;
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  // أخطاء الحفظ غير الملتقطة (لها cause) تظهر كإشعار بدل ما تضيع بالكونسول
  window.addEventListener('error', (e) => {
    if (e.error && e.error.cause) UI.showToast(e.error.message, 'error', 5000);
  });
});