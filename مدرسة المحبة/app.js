// قاعدة بيانات كلمات المرور الافتراضية للوظائف والمواد
const PASSWORDS = {
  fawzi: "fawzi123",
  eriny: "eriny123",
  mina: "mina123",
  fadi: "fadi123",
  mary_history: "mary123",
  mary_heroes: "mary123",
  sally: "sally123",
  admin: "admin123" // كلمة مرور الدخول للإعدادات
};

// حالة التطبيق العامة
let state = {
  students: [], // قائمة الطلاب: [{id, name, team, role, behavior, hymns, creed, history, bible, heroes, total}]
  settings: {
    // رابط جوجل شيت الفعلي الموفر من المستخدم
    googleScriptUrl: "https://script.google.com/macros/s/AKfycbzKzehA7Sm5EvQoZvnseNQj2s05BePM8Vbg6ZHu4gBOi47ZZ9Rpz9KiRVe0OoiRTuRsHA/exec"
  },
  currentPortal: null // البوابة المفتوحة حالياً
};

const SHARED_CONFIG_BIN = "affcedf";
const SHARED_CONFIG_URL = `https://extendsclass.com/api/json-storage/bin/${SHARED_CONFIG_BIN}`;

// جلب الإعدادات السحابية المشتركة
async function fetchSharedSettings() {
  try {
    const res = await fetch(SHARED_CONFIG_URL);
    if (res.ok) {
      const text = await res.text();
      let url = "";
      const trimmed = text.trim();
      if (trimmed.startsWith("{url:") && trimmed.endsWith("}")) {
        url = trimmed.substring(5, trimmed.length - 1);
      } else {
        try {
          const parsed = JSON.parse(trimmed);
          url = parsed.url;
        } catch (e) {
          const match = trimmed.match(/url["']?\s*:\s*["']?([^"'}\s]+)/);
          if (match) url = match[1];
        }
      }
      if (url && url.startsWith("https://")) {
        state.settings.googleScriptUrl = url;
        const urlInput = document.getElementById("google-script-url");
        if (urlInput) urlInput.value = url;
        localStorage.setItem("mahabba_settings", JSON.stringify(state.settings));
        checkConnectionStatus();
      }
    }
  } catch (error) {
    console.error("Failed to fetch shared settings:", error);
  }
}

// التحكم في وضع التحميل ومنع النقرات المكررة
function setLoadingState(isLoading, text = "جاري حفظ ومزامنة البيانات مع جوجل شيت...") {
  const overlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");
  if (overlay) {
    if (isLoading) {
      if (loadingText) loadingText.textContent = text;
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
  }
  
  const inputs = document.querySelectorAll("button, input, select, textarea");
  inputs.forEach(el => {
    if (el.id !== "google-script-url" && el.id !== "open-settings-btn" && !el.closest(".modal-box")) {
      el.disabled = isLoading;
    }
  });
}

// حساب التجميع التراكمي للفريق من قائمة الطلاب المحملة
function calculateTeamTotals(teamName) {
  let totalAttendance = 0;
  let totalBonus = 0;
  let studentCount = 0;
  
  state.students.forEach(s => {
    if (s.team === teamName) {
      totalAttendance += Number(s.attendanceTotal) || 0;
      totalBonus += Number(s.bonusTotal) || 0;
      studentCount++;
    }
  });
  
  return { totalAttendance, totalBonus, studentCount };
}

// تحديث الإحصائيات الفورية لجلسة التحضير الحالية
function updateSessionTotals(teamSuffix) {
  const tbodyId = `attendance-${teamSuffix}-table-body`;
  const rows = document.querySelectorAll(`#${tbodyId} tr`);
  
  let presentCount = 0;
  let bonusCount = 0;
  
  rows.forEach(row => {
    const activePill = row.querySelector(".attendance-pill.active");
    if (activePill && (activePill.textContent === "حاضر" || activePill.textContent === "متأخر")) {
      presentCount++;
    }
    const bonusCheckbox = row.querySelector(".bonus-checkbox");
    if (bonusCheckbox && bonusCheckbox.checked) {
      bonusCount++;
    }
  });
  
  const presentEl = document.getElementById(`${teamSuffix}-present-count`);
  if (presentEl) presentEl.textContent = presentCount;
  
  const bonusEl = document.getElementById(`${teamSuffix}-bonus-count`);
  if (bonusEl) bonusEl.textContent = bonusCount;
}

// تحديث المجاميع التراكمية للفريق في كافة التبويبات
function updateCumulativeTotals(teamName, teamSuffix) {
  const stats = calculateTeamTotals(teamName);
  
  const countEl = document.getElementById(`${teamSuffix}-student-count`);
  if (countEl) countEl.textContent = stats.studentCount;
  
  const attEl = document.getElementById(`${teamSuffix}-cum-attendance`);
  if (attEl) attEl.textContent = stats.totalAttendance;
  
  const bonEl = document.getElementById(`${teamSuffix}-cum-bonus`);
  if (bonEl) bonEl.textContent = stats.totalBonus;
  
  const bonusTabAttEl = document.getElementById(`${teamSuffix}-bonus-tab-cum-attendance`);
  if (bonusTabAttEl) bonusTabAttEl.textContent = stats.totalAttendance;
  
  const bonusTabBonEl = document.getElementById(`${teamSuffix}-bonus-tab-cum-bonus`);
  if (bonusTabBonEl) bonusTabBonEl.textContent = stats.totalBonus;
}

// معالجة تغيير صندوق البونص
function handleBonusCheckboxChange(checkboxEl) {
  const tr = checkboxEl.closest("tr");
  const tbody = tr.parentElement;
  if (tbody.id === "attendance-team1-table-body") {
    updateSessionTotals("team1");
  } else if (tbody.id === "attendance-team2-table-body") {
    updateSessionTotals("team2");
  } else if (tbody.id === "attendance-unspecified-table-body") {
    updateSessionTotals("unspecified");
  }
}

// عند تحميل الصفحة بالكامل
document.addEventListener("DOMContentLoaded", async () => {
  loadLocalState();
  initDateFields();
  checkConnectionStatus();
  
  // جلب رابط جوجل شيت المشترك من السحابة
  await fetchSharedSettings();
  
  refreshAllData();
});

// تهيئة حقول التاريخ الافتراضية بـ تاريخ اليوم
function initDateFields() {
  const today = new Date().toISOString().split("T")[0];
  const dateIds = [
    "attendance-date-team1", "attendance-date-team2", "attendance-date-unspecified",
    "bonus-date-team1", "bonus-date-team2", "bonus-date-unspecified",
    "eriny-date", "mina-date", "fadi-date", "mary-history-date", "mary-heroes-date", "sally-date"
  ];
  dateIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

// تحميل البيانات من LocalStorage
function loadLocalState() {
  const savedSettings = localStorage.getItem("mahabba_settings");
  if (savedSettings) {
    state.settings = JSON.parse(savedSettings);
  } else {
    // حفظ الرابط الافتراضي في localStorage أول مرة
    localStorage.setItem("mahabba_settings", JSON.stringify(state.settings));
  }
  
  const urlInput = document.getElementById("google-script-url");
  if (urlInput) urlInput.value = state.settings.googleScriptUrl;

  const savedStudents = localStorage.getItem("mahabba_students");
  if (savedStudents) {
    state.students = JSON.parse(savedStudents);
  } else {
    // قائمة طلاب افتراضية للمعاينة المحلية بـ درجات افتراضية
    state.students = [
      { id: "جرجس فايز حبيب غالي", name: "جرجس فايز حبيب غالي", team: "الفريق الأول", role: "عضو", behavior: 8, hymns: 10, creed: 6, history: 8, bible: 10, heroes: 8, total: 50 },
      { id: "مينا أشرف شكري", name: "مينا أشرف شكري", team: "الفريق الأول", role: "قائد تيم", behavior: 10, hymns: 8, creed: 8, history: 10, bible: 6, heroes: 10, total: 52 },
      { id: "كيرلس رامي إبراهيم", name: "كيرلس رامي إبراهيم", team: "الفريق الثاني", role: "عضو", behavior: 6, hymns: 6, creed: 10, history: 6, bible: 8, heroes: 6, total: 42 },
      { id: "شنودة القمص بيشوي", name: "شنودة القمص بيشوي", team: "الفريق الثاني", role: "قائد تيم", behavior: 10, hymns: 10, creed: 8, history: 8, bible: 10, heroes: 10, total: 56 }
    ];
    saveStudentsToLocalStorage();
  }
}

// حفظ قائمة الطلاب محلياً
function saveStudentsToLocalStorage() {
  localStorage.setItem("mahabba_students", JSON.stringify(state.students));
}

// التحقق من حالة الربط بجوجل شيت وتحديث شريط الحالة
function checkConnectionStatus() {
  const indicator = document.getElementById("sync-status");
  if (!indicator) return;

  if (state.settings.googleScriptUrl) {
    indicator.textContent = "🟢 متصل ومربوط بـ Google Sheets";
    indicator.className = "status-indicator connected";
  } else {
    indicator.textContent = "⚠️ وضع التشغيل الحالي: التخزين المحلي المؤقت (اضغط على إعدادات جوجل شيت في الأعلى للربط)";
    indicator.className = "status-indicator";
  }
}

// جلب قائمة الطلاب وتحديثها من جوجل شيت
// جلب قائمة الطلاب وتحديثها من جوجل شيت
async function refreshAllData() {
  if (!state.settings.googleScriptUrl) {
    renderStudentsTable();
    renderAttendanceTable();
    renderBonusTable();
    renderGradesTable();
    return;
  }

  showToast("🔄 جاري تحديث البيانات من جوجل شيت...", "info");
  setLoadingState(true, "جاري جلب أحدث البيانات والدرجات من جوجل شيت...");
  try {
    const response = await fetch(state.settings.googleScriptUrl);
    if (!response.ok) throw new Error("HTTP error");
    
    const result = await response.json();
    if (result.status === "success" && result.students) {
      state.students = result.students.map(s => ({
        id: s.name,
        name: s.name,
        team: s.team,
        role: s.role,
        behavior: s.behavior || 0,
        hymns: s.hymns || 0,
        creed: s.creed || 0,
        history: s.history || 0,
        bible: s.bible || 0,
        heroes: s.heroes || 0,
        total: s.total || 0,
        attendanceTotal: s.attendanceTotal || 0,
        bonusTotal: s.bonusTotal || 0
      }));
      saveStudentsToLocalStorage();
      renderStudentsTable();
      renderAttendanceTable();
      renderBonusTable();
      renderGradesTable();
      showToast("🟢 تم تحديث البيانات والدرجات بنجاح", "success");
    } else {
      throw new Error(result.message || "فشل الجلب");
    }
  } catch (error) {
    console.error("Error fetching students:", error);
    showToast("⚠️ فشل تحديث البيانات من جوجل شيت. تم الاعتماد على التخزين المحلي.", "warning");
    renderStudentsTable();
    renderAttendanceTable();
    renderBonusTable();
    renderGradesTable();
  } finally {
    setLoadingState(false);
  }
}

// إرسال البيانات إلى جوجل شيت
async function postToGoogleSheet(action, data) {
  if (!state.settings.googleScriptUrl) {
    handleLocalFallback(action, data);
    return true;
  }

  setLoadingState(true, "جاري إرسال ومزامنة البيانات مع جوجل شيت...");
  try {
    await fetch(state.settings.googleScriptUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({ action, data })
    });

    showToast("🟢 تم التسجيل والمزامنة مع جوجل شيت بنجاح!", "success");
    return true;
  } catch (error) {
    console.error("Error posting to sheet:", error);
    showToast("❌ فشل الاتصال بجوجل شيت. يرجى مراجعة الإنترنت أو الرابط.", "error");
    return false;
  } finally {
    setLoadingState(false);
  }
}

// معالجة البيانات محلياً للتجربة والمعاينة (المحاكاة)
function handleLocalFallback(action, data) {
  if (action === "addStudent") {
    const newStudent = {
      id: data.name,
      name: data.name,
      team: data.team,
      role: data.role || "عضو",
      behavior: 0, hymns: 0, creed: 0, history: 0, bible: 0, heroes: 0, total: 0
    };
    state.students.push(newStudent);
    saveStudentsToLocalStorage();
    renderStudentsTable();
    renderAttendanceTable();
    renderBonusTable();
    renderGradesTable();
    showToast("💾 تم حفظ الطالب محلياً (المحاكاة)", "success");
    
  } else if (action === "editStudent") {
    const idx = state.students.findIndex(s => s.id === data.oldName);
    if (idx !== -1) {
      state.students[idx].id = data.name;
      state.students[idx].name = data.name;
      state.students[idx].team = data.team;
      state.students[idx].role = data.role;
      saveStudentsToLocalStorage();
      renderStudentsTable();
      renderAttendanceTable();
      renderBonusTable();
      renderGradesTable();
      showToast("💾 تم تعديل بيانات الطالب محلياً (المحاكاة)", "success");
    }
  } else if (action === "deleteStudent") {
    state.students = state.students.filter(s => s.id !== data.name);
    saveStudentsToLocalStorage();
    renderStudentsTable();
    renderAttendanceTable();
    renderBonusTable();
    renderGradesTable();
    showToast("🗑️ تم حذف الطالب محلياً (المحاكاة)", "success");
  } else if (action === "recordBehavior") {
    updateMockScore(data.name, 'behavior', data.score);
  } else if (action === "recordHymns") {
    updateMockScore(data.name, 'hymns', data.score);
  } else if (action === "recordCreed") {
    updateMockScore(data.name, 'creed', data.score);
  } else if (action === "recordHistory") {
    updateMockScore(data.name, 'history', data.score);
  } else if (action === "recordBible") {
    updateMockScore(data.name, 'bible', data.score);
  } else if (action === "recordHeroes") {
    updateMockScore(data.name, 'heroes', data.score);
  } else {
    showToast("💾 تم حفظ البيانات بنجاح محلياً (في وضع المعاينة)", "success");
  }
}

// دالة تحديث مجموع الدرجات الوهمية للمحاكاة المحلية
function updateMockScore(studentName, field, score) {
  const idx = state.students.findIndex(s => s.name === studentName);
  if (idx !== -1) {
    const currentVal = Number(state.students[idx][field]) || 0;
    state.students[idx][field] = currentVal + Number(score);
    
    // إعادة حساب المجموع الكلي للمواد
    state.students[idx].total = 
      (Number(state.students[idx].behavior) || 0) +
      (Number(state.students[idx].hymns) || 0) +
      (Number(state.students[idx].creed) || 0) +
      (Number(state.students[idx].history) || 0) +
      (Number(state.students[idx].bible) || 0) +
      (Number(state.students[idx].heroes) || 0);
      
    saveStudentsToLocalStorage();
    renderGradesTable();
    showToast(`💾 تم تحديث رصيد الطالب محلياً في ${field === 'history' ? 'تاريخ الكنيسة' : field === 'heroes' ? 'أبطال إيمان' : field}`, "success");
  }
}

// التنقل بين الصفحات
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add("active");
  }
}

// طلب كلمة مرور للدخول للبوابات
function promptPassword(portalId, portalTitleText) {
  state.currentPortal = portalId;
  
  if (portalId === "fawzi") {
    showPage("fawzi-page");
    refreshAllData();
  } else if (portalId === "eriny") {
    showPage("eriny-page");
    resetErinyInterface();
  } else if (portalId === "mina") {
    showPage("mina-page");
    resetMinaInterface();
  } else if (portalId === "fadi") {
    showPage("fadi-page");
    resetFadiInterface();
  } else if (portalId === "mary_history") {
    showPage("mary-history-page");
    resetMaryHistoryInterface();
  } else if (portalId === "mary_heroes") {
    showPage("mary-heroes-page");
    resetMaryHeroesInterface();
  } else if (portalId === "sally") {
    showPage("sally-page");
    resetSallyInterface();
  }
}

// التحقق من كلمة المرور المكتوبة للبوابة
function verifyPortalPassword() {
  const passwordInput = document.getElementById("portal-password-input").value;
  const portalId = document.getElementById("target-portal-id").value;

  if (passwordInput === PASSWORDS[portalId]) {
    closeModal("password-modal");
    showToast("🔓 تم تسجيل الدخول بنجاح", "success");
    
    if (portalId === "fawzi") {
      showPage("fawzi-page");
      refreshAllData();
    } else if (portalId === "eriny") {
      showPage("eriny-page");
      resetErinyInterface();
    } else if (portalId === "mina") {
      showPage("mina-page");
      resetMinaInterface();
    } else if (portalId === "fadi") {
      showPage("fadi-page");
      resetFadiInterface();
    } else if (portalId === "mary_history") {
      showPage("mary-history-page");
      resetMaryHistoryInterface();
    } else if (portalId === "mary_heroes") {
      showPage("mary-heroes-page");
      resetMaryHeroesInterface();
    } else if (portalId === "sally") {
      showPage("sally-page");
      resetSallyInterface();
    }
  } else {
    showToast("❌ كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى", "error");
  }
}

// الخروج والرجوع للقائمة الرئيسية
function logout() {
  showPage("portal-page");
  state.currentPortal = null;
}

// فتح نافذة الإعدادات
function openSettingsModal() {
  const password = prompt("أدخل كلمة مرور المسؤول لفتح إعدادات جوجل شيت:");
  if (password === PASSWORDS.admin) {
    openModal("settings-modal");
  } else if (password !== null) {
    alert("❌ كلمة المرور غير صحيحة!");
  }
}

// حفظ إعدادات جوجل شيت ونشرها سحابياً لجميع الأجهزة
async function saveSettings() {
  const url = document.getElementById("google-script-url").value.trim();
  state.settings.googleScriptUrl = url;
  
  localStorage.setItem("mahabba_settings", JSON.stringify(state.settings));
  closeModal("settings-modal");
  checkConnectionStatus();
  showToast("💾 تم حفظ الإعدادات محلياً!", "success");
  
  if (url) {
    setLoadingState(true, "جاري نشر وتعميم رابط جوجل شيت سحابياً لجميع الأجهزة...");
    try {
      await fetch(SHARED_CONFIG_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: url })
      });
      showToast("🟢 تم تعميم الرابط لجميع الأجهزة بنجاح!", "success");
    } catch (e) {
      console.error("Cloud sync failed:", e);
      showToast("⚠️ فشل التعميم السحابي. تم الحفظ على هذا الجهاز فقط.", "warning");
    } finally {
      setLoadingState(false);
    }
    refreshAllData();
  }
}

// ==================== منطق واجهة المسؤول (التقييم العام) ====================

// التبديل بين تابات المسؤول
function switchFawziTab(tabId, buttonEl) {
  document.querySelectorAll("#fawzi-page .tab-content").forEach(c => c.classList.remove("active"));
  document.querySelectorAll("#fawzi-page .tab-btn").forEach(b => b.classList.remove("active"));
  
  const el = document.getElementById(tabId);
  if (el) el.classList.add("active");
  buttonEl.classList.add("active");
  
  if (tabId === 'grades-tab') {
    renderGradesTable();
  }
}

// عرض قائمة الطلاب في جداول التعديل والحذف مقسمة بالفرق
function renderStudentsTable() {
  const tbody1 = document.getElementById("students-team1-table-body");
  const tbody2 = document.getElementById("students-team2-table-body");
  const tbodyUnspecified = document.getElementById("students-unspecified-table-body");
  
  if (!tbody1 || !tbody2) return;
  
  tbody1.innerHTML = "";
  tbody2.innerHTML = "";
  if (tbodyUnspecified) tbodyUnspecified.innerHTML = "";
  
  state.students.forEach(student => {
    const tr = document.createElement("tr");
    tr.dataset.studentId = student.id;
    tr.dataset.studentName = student.name;
    
    const roleText = student.role === "قائد تيم" 
      ? `<span class="leader-badge">${student.role}</span>` 
      : student.role || "عضو";
      
    tr.innerHTML = `
      <td style="font-weight: 600;" data-label="اسم الطالب">${student.name}</td>
      <td data-label="الفريق">${student.team || "غير محدد"}</td>
      <td data-label="الدور">${roleText}</td>
      <td data-label="الإجراءات">
        <div class="btn-action-group">
          <button class="btn-small btn-edit" onclick="openEditStudentModal('${student.id}', '${student.name}', '${student.team}', '${student.role}')">✏️ تعديل</button>
          <button class="btn-small btn-delete" onclick="confirmDeleteStudent('${student.id}', '${student.name}')">🗑️ حذف</button>
        </div>
      </td>
    `;
    
    if (student.team === "الفريق الأول") {
      tbody1.appendChild(tr);
    } else if (student.team === "الفريق الثاني") {
      tbody2.appendChild(tr);
    } else {
      if (tbodyUnspecified) {
        tbodyUnspecified.appendChild(tr);
      }
    }
  });
}

// فلترة الطلاب بالبحث داخل جداول الفرق
function filterTeamStudents(teamIndex) {
  const searchQuery = document.getElementById(`search-student-team${teamIndex}`).value.toLowerCase();
  const tbodyId = teamIndex === 1 ? "students-team1-table-body" : "students-team2-table-body";
  const rows = document.querySelectorAll(`#${tbodyId} tr`);
  
  rows.forEach(row => {
    const name = row.cells[0].textContent.toLowerCase();
    if (name.includes(searchQuery)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

// فتح نافذة إضافة طالب جديد مع تحديد الفريق الافتراضي
function openAddStudentModal(defaultTeam = "الفريق الأول") {
  document.getElementById("student-modal-title").textContent = "إضافة طالب جديد";
  document.getElementById("edit-student-id").value = "";
  document.getElementById("student-name-input").value = "";
  document.getElementById("student-team-select").value = defaultTeam;
  document.getElementById("student-role-select").value = "عضو";
  
  openModal("student-modal");
}

// فتح نافذة تعديل طالب
function openEditStudentModal(id, name, team, role) {
  document.getElementById("student-modal-title").textContent = "تعديل بيانات طالب";
  document.getElementById("edit-student-id").value = id;
  document.getElementById("student-name-input").value = name;
  document.getElementById("student-team-select").value = team || "غير محدد";
  document.getElementById("student-role-select").value = role || "عضو";
  
  openModal("student-modal");
}

// حفظ الطالب
async function saveStudent() {
  const id = document.getElementById("edit-student-id").value;
  const name = document.getElementById("student-name-input").value.trim();
  const team = document.getElementById("student-team-select").value;
  const role = document.getElementById("student-role-select").value;
  
  if (!name) {
    showToast("⚠️ يرجى إدخال اسم الطالب رباعي", "warning");
    return;
  }
  
  let success = false;
  
  if (id) {
    const studentData = { oldName: id, name, team, role };
    success = await postToGoogleSheet("editStudent", studentData);
    if (success && state.settings.googleScriptUrl) {
      const idx = state.students.findIndex(s => s.id === id);
      if (idx !== -1) {
        state.students[idx] = { ...state.students[idx], id: name, name, team, role };
        saveStudentsToLocalStorage();
      }
    }
  } else {
    const studentData = { name, team, role };
    success = await postToGoogleSheet("addStudent", studentData);
  }
  
  if (success) {
    closeModal("student-modal");
    refreshAllData();
  }
}

// حذف طالب
function confirmDeleteStudent(id, name) {
  if (confirm(`هل أنت متأكد من حذف الطالب "${name}" تماماً من السجلات والفرق؟`)) {
    executeDeleteStudent(id);
  }
}

async function executeDeleteStudent(id) {
  const success = await postToGoogleSheet("deleteStudent", { name: id });
  if (success) {
    if (state.settings.googleScriptUrl) {
      state.students = state.students.filter(s => s.id !== id);
      saveStudentsToLocalStorage();
    }
    refreshAllData();
  }
}

// عرض قائمة الطلاب لأخذ الحضور والغياب (مفصولاً بالفريق الأول والفريق الثاني)
function renderAttendanceTable() {
  const tbody1 = document.getElementById("attendance-team1-table-body");
  const tbody2 = document.getElementById("attendance-team2-table-body");
  const tbodyUnspecified = document.getElementById("attendance-unspecified-table-body");
  
  if (!tbody1 || !tbody2) return;
  
  tbody1.innerHTML = "";
  tbody2.innerHTML = "";
  if (tbodyUnspecified) tbodyUnspecified.innerHTML = "";
  
  state.students.forEach(student => {
    const tr = document.createElement("tr");
    tr.dataset.studentId = student.id;
    tr.dataset.studentName = student.name;
    
    const attTotal = student.attendanceTotal || 0;
    const bonTotal = student.bonusTotal || 0;
    
    tr.innerHTML = `
      <td style="font-weight: 600;" data-label="اسم الطالب">${student.name}</td>
      <td data-label="الحضور الحالي" style="text-align: center; font-weight: 700; color: var(--primary-mina);">${attTotal}</td>
      <td data-label="البونص الحالي" style="text-align: center; font-weight: 700; color: var(--accent-gold);">${bonTotal}</td>
      <td data-label="حالة الحضور">
        <div class="attendance-pill-group" style="display: flex; align-items: center; gap: 1rem;">
          <div class="pills" style="display: flex; gap: 0.5rem;">
            <button class="attendance-pill present" onclick="setAttendanceStatus(this, 'حاضر')">حاضر</button>
            <button class="attendance-pill late" onclick="setAttendanceStatus(this, 'متأخر')">متأخر</button>
            <button class="attendance-pill absent active" onclick="setAttendanceStatus(this, 'غائب')">غائب</button>
          </div>
          <label class="bonus-checkbox-label" style="display: flex; align-items: center; gap: 0.3rem; cursor: pointer; user-select: none; font-size: 0.9rem; font-weight: 700; color: var(--accent-gold);">
            <input type="checkbox" class="bonus-checkbox" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent-gold);" onchange="handleBonusCheckboxChange(this)">
            <span>🎁 بونص (+1)</span>
          </label>
        </div>
      </td>
    `;
    
    if (student.team === "الفريق الأول") {
      tbody1.appendChild(tr);
    } else if (student.team === "الفريق الثاني") {
      tbody2.appendChild(tr);
    } else {
      if (tbodyUnspecified) {
        tbodyUnspecified.appendChild(tr);
      }
    }
  });
  
  // تحديث إحصائيات الجلسة والمجاميع التراكمية عند التحميل
  updateSessionTotals("team1");
  updateSessionTotals("team2");
  updateSessionTotals("unspecified");
  
  updateCumulativeTotals("الفريق الأول", "team1");
  updateCumulativeTotals("الفريق الثاني", "team2");
  updateCumulativeTotals("غير محدد", "unspecified");
}

// تعيين حالة الحضور للطالب
function setAttendanceStatus(buttonEl, status) {
  const group = buttonEl.parentElement;
  group.querySelectorAll(".attendance-pill").forEach(b => b.classList.remove("active"));
  buttonEl.classList.add("active");
  
  // تحديث الإحصائيات الفورية فوراً بناءً على الفريق
  const tr = buttonEl.closest("tr");
  const tbody = tr.parentElement;
  if (tbody.id === "attendance-team1-table-body") {
    updateSessionTotals("team1");
  } else if (tbody.id === "attendance-team2-table-body") {
    updateSessionTotals("team2");
  } else if (tbody.id === "attendance-unspecified-table-body") {
    updateSessionTotals("unspecified");
  }
}

// حفظ الحضور والغياب لفريق محدد في شيت جوجل
async function saveTeamAttendance(teamName) {
  let teamSuffix = "unspecified";
  if (teamName === "الفريق الأول") teamSuffix = "team1";
  else if (teamName === "الفريق الثاني") teamSuffix = "team2";

  const date = document.getElementById(`attendance-date-${teamSuffix}`).value;
  const subject = document.getElementById(`attendance-subject-${teamSuffix}`).value;
  if (!date) {
    showToast("⚠️ يرجى تحديد تاريخ اليوم للحضور", "warning");
    return;
  }
  
  setLoadingState(true, "جاري التحقق من حالة التسجيل السابقة...");
  
  // التحقق مما إذا كان قد تم تسجيل حضور هذا اليوم وهذه المادة مسبقاً
  if (state.settings.googleScriptUrl) {
    try {
      const checkUrl = `${state.settings.googleScriptUrl}?action=checkAttendanceExists&date=${date}&subject=${encodeURIComponent(subject)}&team=${encodeURIComponent(teamName)}`;
      const response = await fetch(checkUrl);
      if (response.ok) {
        const checkResult = await response.json();
        if (checkResult.exists) {
          setLoadingState(false); // إلغاء الحظر مؤقتاً لسؤال المستخدم
          const confirmEdit = confirm("⚠️ لقد تم تسجيل حضور هذا الفريق لهذه المادة اليوم بالفعل.\nهل تريد تعديل التسجيل؟");
          if (!confirmEdit) {
            return;
          }
          setLoadingState(true, "جاري التحضير للحفظ والتسجيل...");
        }
      }
    } catch (err) {
      console.error("Error checking attendance existence:", err);
    }
  }
  
  const tbodyId = `attendance-${teamSuffix}-table-body`;
  const rows = document.querySelectorAll(`#${tbodyId} tr`);
  if (rows.length === 0) {
    showToast("⚠️ لا يوجد طلاب في هذا الفريق لتسجيل حضورهم", "warning");
    setLoadingState(false);
    return;
  }
  
  const records = [];
  
  rows.forEach(row => {
    const id = row.dataset.studentId;
    const name = row.dataset.studentName;
    const activeBtn = row.querySelector(".attendance-pill.active");
    const status = activeBtn ? activeBtn.textContent : "غائب";
    const bonusCheckbox = row.querySelector(".bonus-checkbox");
    const hasBonus = bonusCheckbox && bonusCheckbox.checked ? 1 : 0;
    
    // دمج الحضور والبونص في صف واحد
    records.push({ id, name, status, bonus: hasBonus });
  });
  
  showToast("⏳ جاري تسجيل الحضور والغياب مع البونص...", "info");
  const success = await postToGoogleSheet("recordAttendance", { date, subject, records });
  if (success) {
    showToast(`💾 تم رصد وحفظ حضور وبونص ${teamName} بنجاح!`, "success");
    await refreshAllData();
  } else {
    setLoadingState(false);
  }
}

// ==================== منطق رصد البونص بالكامل (شبه الغياب) ====================

// دالة تهيئة رصد البونص وتفريغ الحقول
function renderBonusTable() {
  resetBonusForm('team1');
  resetBonusForm('team2');
  resetBonusForm('unspecified');
}

// تفريغ نموذج البونص لفريق معين
function resetBonusForm(teamSuffix) {
  const searchInput = document.getElementById(`bonus-student-search-${teamSuffix}`);
  const idInput = document.getElementById(`bonus-student-id-${teamSuffix}`);
  const pointsInput = document.getElementById(`bonus-points-${teamSuffix}`);
  if (searchInput) searchInput.value = "";
  if (idInput) idInput.value = "";
  if (pointsInput) pointsInput.value = "";
  const resultsDiv = document.getElementById(`bonus-search-results-${teamSuffix}`);
  if (resultsDiv) {
    resultsDiv.innerHTML = "";
    resultsDiv.classList.remove("active");
  }
}

// البحث الذكي المخصص لطلاب الفريق الأول في البونص
function searchStudentForBonusTeam1(query) {
  handleBonusStudentSearch(query, 'team1', 'الفريق الأول');
}

// البحث الذكي المخصص لطلاب الفريق الثاني في البونص
function searchStudentForBonusTeam2(query) {
  handleBonusStudentSearch(query, 'team2', 'الفريق الثاني');
}

// البحث الذكي المخصص لطلاب غير محددين في البونص
function searchStudentForBonusUnspecified(query) {
  handleBonusStudentSearch(query, 'unspecified', 'غير محدد');
}

// الدالة العامة لمعالجة البحث الفوري عن الطلاب بالبونص
function handleBonusStudentSearch(query, teamSuffix, teamName) {
  const resultsDiv = document.getElementById(`bonus-search-results-${teamSuffix}`);
  if (!resultsDiv) return;
  resultsDiv.innerHTML = "";
  
  const teamStudents = state.students.filter(s => {
    if (teamName === 'غير محدد') {
      return s.team !== 'الفريق الأول' && s.team !== 'الفريق الثاني';
    }
    return s.team === teamName;
  });
  
  const filtered = !query || !query.trim()
    ? teamStudents
    : teamStudents.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));
    
  if (filtered.length > 0) {
    filtered.forEach(student => {
      const item = document.createElement("div");
      item.className = "search-item";
      item.textContent = student.name;
      item.onclick = () => {
        document.getElementById(`bonus-student-search-${teamSuffix}`).value = student.name;
        document.getElementById(`bonus-student-id-${teamSuffix}`).value = student.id;
        resultsDiv.classList.remove("active");
      };
      resultsDiv.appendChild(item);
    });
    resultsDiv.classList.add("active");
  } else {
    resultsDiv.innerHTML = `<div class="search-item" style="color:var(--text-muted); cursor:default;">لا يوجد نتائج</div>`;
    resultsDiv.classList.add("active");
  }
}

// تعديل سريع لقيم نقاط البونص بالأزرار (+1, +2, +5, -1)
function adjustBonusPoints(teamSuffix, val) {
  const el = document.getElementById(`bonus-points-${teamSuffix}`);
  if (!el) return;
  const current = parseInt(el.value) || 0;
  el.value = current + val;
}

// حفظ بونص طالب محدد في شيت جوجل
async function saveTeamBonus(teamName) {
  let teamSuffix = "unspecified";
  if (teamName === "الفريق الأول") teamSuffix = "team1";
  else if (teamName === "الفريق الثاني") teamSuffix = "team2";
  
  const date = document.getElementById(`bonus-date-${teamSuffix}`).value;
  const subject = document.getElementById(`bonus-subject-${teamSuffix}`).value;
  const studentId = document.getElementById(`bonus-student-id-${teamSuffix}`).value;
  const studentNameVal = document.getElementById(`bonus-student-search-${teamSuffix}`).value;
  const pointsVal = document.getElementById(`bonus-points-${teamSuffix}`).value;
  
  if (!date) {
    showToast("⚠️ يرجى تحديد تاريخ البونص أولاً", "warning");
    return;
  }
  if (!studentId || !studentNameVal) {
    showToast("⚠️ يرجى اختيار الطالب بالبحث وتحديده من القائمة", "warning");
    return;
  }
  if (pointsVal === "" || isNaN(pointsVal)) {
    showToast("⚠️ يرجى إدخال نقاط البونص", "warning");
    return;
  }
  
  const records = [{ name: studentNameVal, points: Number(pointsVal) }];
  
  const success = await postToGoogleSheet("recordBonus", { date, subject, records });
  if (success) {
    showToast(`🎯 تم حفظ بونص ${teamName} لمادة ${subject} بنجاح!`, "success");
    resetBonusForm(teamSuffix);
    refreshAllData();
  }
}

// البحث الذكي المخصص لطلاب المواد مع الفلترة حسب الفريق
function handleStudentSearch(query, resultsDivId, searchInputId, idInputId, prefix) {
  const resultsDiv = document.getElementById(resultsDivId);
  if (!resultsDiv) return;
  resultsDiv.innerHTML = "";
  
  // الحصول على الفريق المختار
  const teamSelect = document.getElementById(`${prefix}-team-select`);
  const selectedTeam = teamSelect ? teamSelect.value : "all";
  
  // فلترة الطلاب حسب الفريق المختار
  const teamStudents = state.students.filter(s => {
    if (selectedTeam === "all") return true;
    if (selectedTeam === "غير محدد") {
      return s.team !== "الفريق الأول" && s.team !== "الفريق الثاني";
    }
    return s.team === selectedTeam;
  });
  
  const filtered = !query || !query.trim()
    ? teamStudents
    : teamStudents.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));
    
  if (filtered.length > 0) {
    filtered.forEach(student => {
      const item = document.createElement("div");
      item.className = "search-item";
      item.textContent = student.name + (selectedTeam === "all" ? ` (${student.team || "غير محدد"})` : "");
      item.onclick = () => {
        document.getElementById(searchInputId).value = student.name;
        document.getElementById(idInputId).value = student.id;
        resultsDiv.classList.remove("active");
      };
      resultsDiv.appendChild(item);
    });
    resultsDiv.classList.add("active");
  } else {
    resultsDiv.innerHTML = `<div class="search-item" style="color:var(--text-muted); cursor:default;">لا يوجد نتائج</div>`;
    resultsDiv.classList.add("active");
  }
}

// تبديل إدخال الاسم اليدوي
function toggleManualName(prefix) {
  const isManual = document.getElementById(`${prefix}-name-not-found`)?.checked || false;
  const searchGroup = document.getElementById(`${prefix}-search-group`);
  const manualGroup = document.getElementById(`${prefix}-manual-name-group`);
  
  if (isManual) {
    if (searchGroup) searchGroup.style.display = "none";
    if (manualGroup) manualGroup.style.display = "block";
    document.getElementById(`${prefix}-student-id`).value = "";
    document.getElementById(`${prefix}-student-search`).value = "";
    const manualNameInput = document.getElementById(`${prefix}-manual-name`);
    if (manualNameInput) manualNameInput.focus();
  } else {
    if (searchGroup) searchGroup.style.display = "block";
    if (manualGroup) manualGroup.style.display = "none";
    const manualNameInput = document.getElementById(`${prefix}-manual-name`);
    if (manualNameInput) manualNameInput.value = "";
  }
}

function resetMaterialInterface(prefix) {
  const studentIdEl = document.getElementById(`${prefix}-student-id`);
  if (studentIdEl) studentIdEl.value = "";
  
  const studentSearchEl = document.getElementById(`${prefix}-student-search`);
  if (studentSearchEl) studentSearchEl.value = "";
  
  const manualNameEl = document.getElementById(`${prefix}-manual-name`);
  if (manualNameEl) manualNameEl.value = "";
  
  const checkboxEl = document.getElementById(`${prefix}-name-not-found`);
  if (checkboxEl) checkboxEl.checked = false;
  
  toggleManualName(prefix);
  
  const scoreValueEl = document.getElementById(`${prefix}-score-value`);
  if (scoreValueEl) scoreValueEl.value = "";
  
  const previewEl = document.getElementById(`${prefix}-score-preview`);
  if (previewEl) previewEl.querySelector("span").textContent = "-";
  
  document.querySelectorAll(`.${prefix}-theme .score-btn`).forEach(b => b.classList.remove("active"));
  initDateFields();
}

async function saveMaterialScore(prefix, actionName) {
  const isManual = document.getElementById(`${prefix}-name-not-found`)?.checked || false;
  let id = "";
  let name = "";
  let team = "غير محدد";
  
  if (isManual) {
    name = document.getElementById(`${prefix}-manual-name`).value.trim();
    id = name;
    const teamSelect = document.getElementById(`${prefix}-team-select`);
    team = teamSelect ? teamSelect.value : "غير محدد";
    if (team === "all") team = "غير محدد";
  } else {
    id = document.getElementById(`${prefix}-student-id`).value;
    name = document.getElementById(`${prefix}-student-search`).value;
  }
  
  const score = document.getElementById(`${prefix}-score-value`).value;
  const date = document.getElementById(`${prefix}-date`).value;
  
  if (!name) {
    if (isManual) {
      showToast("⚠️ يرجى إدخال اسم الطالب الجديد رباعي", "warning");
    } else {
      showToast("⚠️ يرجى اختيار الطالب أولاً بالبحث واختياره من القائمة", "warning");
    }
    return;
  }
  if (score === "" || score === null || score === undefined || isNaN(score)) {
    showToast("⚠️ يرجى اختيار درجة التقييم المحددة للطالب (من 0 إلى 10)", "warning");
    return;
  }
  const numScore = Number(score);
  if (numScore < 0 || numScore > 10) {
    showToast("⚠️ يجب أن تكون الدرجة بين 0 و 10", "warning");
    return;
  }
  
  let success = false;
  if (isManual) {
    showToast("⏳ جاري تسجيل الطالب الجديد في الشيت...", "info");
    const addSuccess = await postToGoogleSheet("addStudent", { name, team, role: "عضو" });
    if (!addSuccess) {
      showToast("❌ فشل إضافة الطالب الجديد. تعذر رصد الدرجة.", "error");
      return;
    }
    
    // محاكاة الإضافة محلياً في حالة عدم الربط بجوجل شيت ليتزامن الكود مع localFallback
    if (!state.settings.googleScriptUrl) {
      // تم التعامل معها في handleLocalFallback
    }
  }
  
  success = await postToGoogleSheet(actionName, { date, id, name, score });
  if (success) {
    if (prefix === 'eriny') resetErinyInterface();
    else if (prefix === 'mina') resetMinaInterface();
    else if (prefix === 'fadi') resetFadiInterface();
    else if (prefix === 'mary-history') resetMaryHistoryInterface();
    else if (prefix === 'mary-heroes') resetMaryHeroesInterface();
    else if (prefix === 'sally') resetSallyInterface();
    refreshAllData();
  }
}

// ==================== واجهة السلوكيات ====================
function resetErinyInterface() { resetMaterialInterface('eriny'); }
function searchStudentForEriny(query) { handleStudentSearch(query, 'eriny-search-results', 'eriny-student-search', 'eriny-student-id', 'eriny'); }
function saveBehaviorScore() { saveMaterialScore('eriny', 'recordBehavior'); }

// ==================== واجهة الألحان ====================
function resetMinaInterface() { resetMaterialInterface('mina'); }
function searchStudentForMina(query) { handleStudentSearch(query, 'mina-search-results', 'mina-student-search', 'mina-student-id', 'mina'); }
function saveHymnsScore() { saveMaterialScore('mina', 'recordHymns'); }

// ==================== واجهة العقيدة ====================
function resetFadiInterface() { resetMaterialInterface('fadi'); }
function searchStudentForFadi(query) { handleStudentSearch(query, 'fadi-search-results', 'fadi-student-search', 'fadi-student-id', 'fadi'); }
function saveCreedScore() { saveMaterialScore('fadi', 'recordCreed'); }

// ==================== واجهة تاريخ الكنيسة ====================
function resetMaryHistoryInterface() { resetMaterialInterface('mary-history'); }
function searchStudentForMaryHistory(query) { handleStudentSearch(query, 'mary-history-search-results', 'mary-history-student-search', 'mary-history-student-id', 'mary-history'); }
function saveHistoryScore() { saveMaterialScore('mary-history', 'recordHistory'); }

// ==================== واجهة أبطال إيمان ====================
function resetMaryHeroesInterface() { resetMaterialInterface('mary-heroes'); }
function searchStudentForMaryHeroes(query) { handleStudentSearch(query, 'mary-heroes-search-results', 'mary-heroes-student-search', 'mary-heroes-student-id', 'mary-heroes'); }
function saveHeroesScore() { saveMaterialScore('mary-heroes', 'recordHeroes'); }

// ==================== واجهة الكتاب المقدس ====================
function resetSallyInterface() { resetMaterialInterface('sally'); }
function searchStudentForSally(query) { handleStudentSearch(query, 'sally-search-results', 'sally-student-search', 'sally-student-id', 'sally'); }
function saveBibleScore() { saveMaterialScore('sally', 'recordBible'); }

// اختيار الدرجة لجميع الواجهات
function selectScore(theme, score) {
  const themeClass = `.${theme}-theme`;
  document.querySelectorAll(`${themeClass} .score-btn`).forEach(b => {
    if (parseInt(b.textContent) === score) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });
  
  document.getElementById(`${theme}-score-value`).value = score;
  document.getElementById(`${theme}-score-preview`).querySelector("span").textContent = score;
}

// ==================== جدول درجات المواد ====================

// عرض جدول الدرجات ديناميكياً
function renderGradesTable() {
  const tbody = document.getElementById("grades-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  state.students.forEach(student => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 600;" data-label="اسم الطالب">${student.name}</td>
      <td data-label="الفريق">${student.team || "غير محدد"}</td>
      <td data-label="السلوكيات">${student.behavior || 0}</td>
      <td data-label="الألحان">${student.hymns || 0}</td>
      <td data-label="العقيدة">${student.creed || 0}</td>
      <td data-label="تاريخ كنيسة">${student.history || 0}</td>
      <td data-label="كتاب مقدس">${student.bible || 0}</td>
      <td data-label="أبطال إيمان">${student.heroes || 0}</td>
      <td data-label="المجموع" style="font-weight: 800; color: var(--accent-gold); font-size: 1.1rem;">${student.total || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// تصفية وفلترة جدول الدرجات فوراً
function filterGradesTable() {
  const searchQuery = document.getElementById("search-grade-input").value.toLowerCase();
  const teamFilter = document.getElementById("filter-grade-team-select").value;
  const rows = document.querySelectorAll("#grades-table-body tr");
  
  rows.forEach(row => {
    const name = row.cells[0].textContent.toLowerCase();
    const team = row.cells[1].textContent;
    
    const matchesSearch = name.includes(searchQuery);
    let matchesTeam = true;
    
    if (teamFilter === "غير محدد") {
      matchesTeam = (team === "غير محدد" || team === "");
    } else if (teamFilter !== "all") {
      matchesTeam = (team === teamFilter);
    }
    
    if (matchesSearch && matchesTeam) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

// ==================== التحكم بالنوافذ المنبثقة والتنبيهات (UI Helpers) ====================

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("active");
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove("active");
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast-notification");
  const tMessage = document.getElementById("toast-message");
  const tIcon = document.getElementById("toast-icon");
  
  if (!toast) return;
  
  let icon = "ℹ️";
  if (type === "success") icon = "🟢";
  else if (type === "error") icon = "❌";
  else if (type === "warning") icon = "⚠️";
  
  tIcon.textContent = icon;
  tMessage.textContent = message;
  
  toast.className = `toast active ${type}`;
  
  setTimeout(() => {
    toast.classList.remove("active");
  }, 3000);
}

// إغلاق قوائم البحث عند الضغط في أي مكان آخر بالصفحة
document.addEventListener("click", (e) => {
  const containers = [
    "eriny-search-results", "mina-search-results",
    "fadi-search-results", "mary-history-search-results", "mary-heroes-search-results", "sally-search-results",
    "bonus-search-results-team1", "bonus-search-results-team2", "bonus-search-results-unspecified"
  ];
  const inputs = [
    "eriny-student-search", "mina-student-search",
    "fadi-student-search", "mary-history-student-search", "mary-heroes-student-search", "sally-student-search",
    "bonus-student-search-team1", "bonus-student-search-team2", "bonus-student-search-unspecified"
  ];
  
  containers.forEach((cid, index) => {
    const el = document.getElementById(cid);
    const input = document.getElementById(inputs[index]);
    if (el && e.target !== el && e.target !== input) {
      el.classList.remove("active");
    }
  });
});
