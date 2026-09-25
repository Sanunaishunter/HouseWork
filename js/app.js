(function () {
  "use strict";

  const STORAGE_KEY = "housework_records_v1";

  const CHORE_TYPES = [
    { id: "laundry",   label: "洗衣",  emoji: "🧺", cls: "chore-laundry",   color: "#FFD166" },
    { id: "breakfast", label: "早餐",  emoji: "🍳", cls: "chore-breakfast", color: "#FFB627" },
    { id: "lunch",     label: "中餐",  emoji: "🍱", cls: "chore-lunch",     color: "#FF9F1C" },
    { id: "dinner",    label: "晚餐",  emoji: "🍲", cls: "chore-dinner",    color: "#FB5607" },
    { id: "sweep",     label: "掃地",  emoji: "🧹", cls: "chore-sweep",     color: "#06D6A0" },
    { id: "mop",     label: "拖地",        emoji: "🪣", cls: "chore-mop",     color: "#118AB2" },
    { id: "scolded", label: "被罵",        emoji: "😢", cls: "chore-scolded", color: "#EF476F", hasMemo: true },
    { id: "doctor",  label: "看病",        emoji: "🏥", cls: "chore-doctor",  color: "#00C2A8", hasMemo: true },
    { id: "outing",  label: "帶出門去玩",  emoji: "🎡", cls: "chore-outing",  color: "#9B5DE5" },
    { id: "work",    label: "上班",        emoji: "💼", cls: "chore-work",    color: "#00BBF9" },
    { id: "sidejob", label: "副業",        emoji: "🧑‍💻", cls: "chore-sidejob", color: "#8AC926" },
    { id: "credit",  label: "信用卡遲繳",  emoji: "💳", cls: "chore-credit",  color: "#F15BB5" },
  ];

  const choreById = Object.fromEntries(CHORE_TYPES.map(c => [c.id, c]));

  /** @typedef {{id:string, typeId:string, date:string, time:string, memo?:string, createdAt:string}} Record */

  /** @type {Record[]} */
  let records = loadRecords();
  let pendingChoreId = null; // chore awaiting memo confirmation for a NEW record
  let pendingRecordId = null; // existing record whose memo is being edited

  let selectedDate = todayStr(); // YYYY-MM-DD currently shown in the day detail panel
  const todayParts = new Date();
  let calendarYear = todayParts.getFullYear();
  let calendarMonth = todayParts.getMonth(); // 0-indexed

  // ---------- Storage ----------
  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load records", e);
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  // "cooking" (煮飯三餐) was split into breakfast/lunch/dinner; keep old records visible.
  function migrateRecords() {
    let changed = false;
    records.forEach(r => {
      if (r.typeId === "cooking") {
        r.typeId = "lunch";
        changed = true;
      }
    });
    if (changed) saveRecords();
  }

  function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function nowTimeStr() {
    const d = new Date();
    return d.toTimeString().slice(0, 5);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Password lock (smoke screen) ----------
  // Pure client-side string comparison - NOT real access control. Anyone who
  // opens this file can read LOCK_PASSWORD. It only hides the board from a
  // casual glance; it does not protect the data (still plain in localStorage).
  const LOCK_PASSWORD = "16696001277431815";
  const LOGGED_OUT_KEY = "housework_logged_out";

  function activateLock(input) {
    input.classList.add("active");
    input.focus();
  }

  function deactivateLock(input) {
    input.classList.remove("active");
    input.value = "";
  }

  function unlockApp() {
    localStorage.removeItem(LOGGED_OUT_KEY);
    document.getElementById("appRoot").classList.remove("hidden");
  }

  function lockApp() {
    localStorage.setItem(LOGGED_OUT_KEY, "true");
    document.getElementById("appRoot").classList.add("hidden");
  }

  function initPasswordLock() {
    const input = document.getElementById("lock-password");
    const confirmMark = document.getElementById("password-confirm");

    if (localStorage.getItem(LOGGED_OUT_KEY) === "true") {
      document.getElementById("appRoot").classList.add("hidden");
    }

    // Same element the whole time (never swapped for another one), so
    // touching it can't shift anything under the pointer or re-trigger itself.
    input.addEventListener("mouseenter", () => activateLock(input));
    input.addEventListener("focus", () => activateLock(input));
    input.addEventListener("blur", () => deactivateLock(input));
    input.addEventListener("input", () => {
      if (input.value === LOCK_PASSWORD) {
        confirmMark.classList.remove("hidden");
        setTimeout(() => confirmMark.classList.add("hidden"), 1200);
        input.blur();
        unlockApp();
      }
    });
    document.getElementById("logout-btn").addEventListener("click", lockApp);
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  // ---------- Tabs ----------
  function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
        if (btn.dataset.tab === "history") renderHistory();
        if (btn.dataset.tab === "stats") renderStats();
      });
    });
  }

  // ---------- Board / Palette ----------
  function initPalette() {
    const palette = document.getElementById("palette");
    palette.innerHTML = "";
    CHORE_TYPES.forEach(chore => {
      const block = document.createElement("div");
      block.className = "chore-block " + chore.cls;
      block.draggable = true;
      block.dataset.choreId = chore.id;
      block.innerHTML = `<span class="emoji">${chore.emoji}</span><span class="label">${chore.label}</span>`;

      block.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", chore.id);
        block.classList.add("dragging");
      });
      block.addEventListener("dragend", () => block.classList.remove("dragging"));

      // Click fallback (also great for touch devices)
      block.addEventListener("click", () => handleChoreDropped(chore.id));

      palette.appendChild(block);
    });
  }

  function initDropzone() {
    const zone = document.getElementById("dropzone");
    zone.addEventListener("dragover", e => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", e => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const choreId = e.dataTransfer.getData("text/plain");
      if (choreId) handleChoreDropped(choreId);
    });
  }

  function getBoardDate() {
    return selectedDate;
  }

  // ---------- Calendar ----------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function dateKey(year, month, day) {
    return `${year}-${pad2(month + 1)}-${pad2(day)}`;
  }

  function selectDate(dateStr) {
    selectedDate = dateStr;
    const drawer = document.getElementById("palette-drawer");
    drawer.hidden = true;
    document.getElementById("add-task-btn").textContent = "＋ 新增任務";
    renderBoard();
  }

  function renderCalendar() {
    const label = document.getElementById("calendar-month-label");
    label.textContent = `${calendarYear} 年 ${calendarMonth + 1} 月`;

    const countByDate = {};
    records.forEach(r => {
      countByDate[r.date] = (countByDate[r.date] || 0) + 1;
    });

    const grid = document.getElementById("calendar-grid");
    grid.innerHTML = "";

    const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const today = todayStr();

    for (let i = 0; i < firstWeekday; i++) {
      const filler = document.createElement("div");
      filler.className = "cal-day cal-day-filler";
      grid.appendChild(filler);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(calendarYear, calendarMonth, day);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-day";
      if (key === today) cell.classList.add("cal-day-today");
      if (key === selectedDate) cell.classList.add("cal-day-selected");

      const count = countByDate[key] || 0;
      cell.innerHTML = `
        <span class="cal-day-num">${day}</span>
        ${count ? `<span class="cal-day-dot">${count > 9 ? "9+" : count}</span>` : ""}
      `;
      cell.addEventListener("click", () => selectDate(key));
      grid.appendChild(cell);
    }
  }

  function initCalendar() {
    document.getElementById("cal-prev").addEventListener("click", () => {
      calendarMonth--;
      if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
      renderCalendar();
    });
    document.getElementById("cal-next").addEventListener("click", () => {
      calendarMonth++;
      if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
      renderCalendar();
    });
    document.getElementById("cal-today-btn").addEventListener("click", () => {
      const now = new Date();
      calendarYear = now.getFullYear();
      calendarMonth = now.getMonth();
      selectDate(todayStr());
    });
    document.getElementById("add-task-btn").addEventListener("click", () => {
      const drawer = document.getElementById("palette-drawer");
      const btn = document.getElementById("add-task-btn");
      drawer.hidden = !drawer.hidden;
      btn.textContent = drawer.hidden ? "＋ 新增任務" : "－ 收合方塊";
    });
  }

  function renderDayDetailTitle() {
    const title = document.getElementById("day-detail-title");
    const count = records.filter(r => r.date === selectedDate).length;
    title.textContent = `${formatDateLabel(selectedDate)} · ${count} 項紀錄`;
  }

  function handleChoreDropped(choreId) {
    const chore = choreById[choreId];
    if (!chore) return;
    if (chore.hasMemo) {
      pendingChoreId = choreId;
      pendingRecordId = null;
      openMemoModal(chore, "");
      return;
    }
    addRecord(choreId, null);
  }

  function addRecord(choreId, memo) {
    const rec = {
      id: uid(),
      typeId: choreId,
      date: getBoardDate(),
      time: nowTimeStr(),
      memo: memo || undefined,
      createdAt: new Date().toISOString(),
    };
    records.push(rec);
    saveRecords();
    renderBoard();
    showToast(`✅ 已記錄：${choreById[choreId].label}`);
  }

  function renderBoard() {
    const date = getBoardDate();
    const container = document.getElementById("board-entries");
    const placeholder = document.getElementById("dropzone-placeholder");
    const todays = records
      .filter(r => r.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));

    container.innerHTML = "";
    placeholder.style.display = todays.length ? "none" : "block";

    renderCalendar();
    renderDayDetailTitle();

    todays.forEach(rec => {
      const chore = choreById[rec.typeId];
      if (!chore) return;
      const chip = document.createElement("div");
      chip.className = "entry-chip " + chore.cls;
      if (chore.hasMemo) chip.classList.add("editable");
      chip.innerHTML = `
        <span class="emoji">${chore.emoji}</span>
        <span class="title">${chore.label}</span>
        <span class="time">${rec.time}</span>
        ${chore.hasMemo
          ? (rec.memo
            ? `<span class="memo-tag" title="${escapeHtml(rec.memo)}">📝 ${escapeHtml(truncate(rec.memo, 12))}</span>`
            : `<span class="memo-tag memo-tag-empty">+ 備註</span>`)
          : ""}
        <button class="del-btn" data-id="${rec.id}" title="刪除">✕</button>
      `;
      chip.querySelector(".del-btn").addEventListener("click", e => {
        e.stopPropagation();
        deleteRecord(rec.id);
      });
      if (chore.hasMemo) {
        chip.addEventListener("click", () => editRecordMemo(rec));
      }
      container.appendChild(chip);
    });
  }

  function deleteRecord(id) {
    records = records.filter(r => r.id !== id);
    saveRecords();
    renderBoard();
    renderHistory();
    renderStats();
  }

  // ---------- Memo Modal ----------
  function openMemoModal(chore, existingMemo) {
    const modal = document.getElementById("memo-modal");
    const title = document.getElementById("memo-modal-title");
    const input = document.getElementById("memo-input");
    title.textContent = `${chore.emoji} ${chore.label}｜${existingMemo ? "編輯備註" : "新增備註"}`;
    input.value = existingMemo || "";
    modal.classList.add("open");
    input.focus();
  }

  function editRecordMemo(rec) {
    const chore = choreById[rec.typeId];
    if (!chore) return;
    pendingChoreId = null;
    pendingRecordId = rec.id;
    openMemoModal(chore, rec.memo || "");
  }

  function closeMemoModal() {
    document.getElementById("memo-modal").classList.remove("open");
    pendingChoreId = null;
    pendingRecordId = null;
  }

  function initMemoModal() {
    document.getElementById("memo-cancel").addEventListener("click", closeMemoModal);
    document.getElementById("memo-save").addEventListener("click", () => {
      const memo = document.getElementById("memo-input").value.trim();
      if (pendingRecordId) {
        const rec = records.find(r => r.id === pendingRecordId);
        if (rec) {
          rec.memo = memo || undefined;
          saveRecords();
          renderBoard();
          renderHistory();
          renderStats();
          showToast("✅ 備註已更新");
        }
      } else if (pendingChoreId) {
        addRecord(pendingChoreId, memo);
      }
      closeMemoModal();
    });
  }

  // ---------- History ----------
  function initHistoryControls() {
    const filter = document.getElementById("history-filter");
    filter.innerHTML = '<option value="">全部項目</option>' +
      CHORE_TYPES.map(c => `<option value="${c.id}">${c.emoji} ${c.label}</option>`).join("");
    filter.addEventListener("change", renderHistory);
    document.getElementById("history-search").addEventListener("input", renderHistory);
  }

  function renderHistory() {
    const list = document.getElementById("history-list");
    const search = document.getElementById("history-search").value.trim().toLowerCase();
    const filterType = document.getElementById("history-filter").value;

    let filtered = records.filter(r => {
      const chore = choreById[r.typeId];
      if (!chore) return false;
      if (filterType && r.typeId !== filterType) return false;
      if (search) {
        const hay = (chore.label + " " + (r.memo || "")).toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-msg">還沒有符合條件的紀錄</div>';
      return;
    }

    // group by date desc
    const byDate = {};
    filtered.forEach(r => {
      (byDate[r.date] = byDate[r.date] || []).push(r);
    });
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    list.innerHTML = "";
    dates.forEach(date => {
      const dayWrap = document.createElement("div");
      dayWrap.className = "history-day";
      const items = byDate[date].sort((a, b) => b.time.localeCompare(a.time));
      dayWrap.innerHTML = `<h4>${formatDateLabel(date)}</h4>`;
      items.forEach(rec => {
        const chore = choreById[rec.typeId];
        const item = document.createElement("div");
        item.className = "history-item";
        if (chore.hasMemo) item.classList.add("editable");
        item.style.borderLeftColor = chore.color;
        item.innerHTML = `
          <span class="emoji">${chore.emoji}</span>
          <div class="info">
            <div class="title">${chore.label}</div>
            ${rec.memo
              ? `<div class="memo">📝 ${escapeHtml(rec.memo)}</div>`
              : (chore.hasMemo ? `<div class="memo memo-empty">+ 點擊新增備註</div>` : "")}
          </div>
          <span class="time">${rec.time}</span>
          <button class="del-btn" data-id="${rec.id}" title="刪除">🗑️</button>
        `;
        item.querySelector(".del-btn").addEventListener("click", e => {
          e.stopPropagation();
          deleteRecord(rec.id);
        });
        if (chore.hasMemo) {
          item.addEventListener("click", () => editRecordMemo(rec));
        }
        dayWrap.appendChild(item);
      });
      list.appendChild(dayWrap);
    });
  }

  function formatDateLabel(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `${dateStr}（週${weekday}）`;
  }

  // ---------- Stats ----------
  function renderStats() {
    const summary = document.getElementById("stats-summary");
    const total = records.length;
    const today = records.filter(r => r.date === todayStr()).length;
    const scoldedCount = records.filter(r => r.typeId === "scolded").length;
    const uniqueDays = new Set(records.map(r => r.date)).size;

    summary.innerHTML = `
      <div class="stat-card"><div class="num">${total}</div><div class="label">總紀錄數</div></div>
      <div class="stat-card"><div class="num">${today}</div><div class="label">今日紀錄</div></div>
      <div class="stat-card"><div class="num">${scoldedCount}</div><div class="label">被罵次數</div></div>
      <div class="stat-card"><div class="num">${uniqueDays}</div><div class="label">紀錄天數</div></div>
    `;

    // Last 7 days chart
    const chart = document.getElementById("stats-chart");
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const counts = days.map(d => records.filter(r => r.date === d).length);
    const maxCount = Math.max(1, ...counts);
    chart.innerHTML = days.map((d, i) => {
      const h = Math.round((counts[i] / maxCount) * 110) + 4;
      const label = d.slice(5).replace("-", "/");
      return `
        <div class="chart-col">
          <div class="chart-count">${counts[i] || ""}</div>
          <div class="chart-bar" style="height:${h}px"></div>
          <div class="chart-label">${label}</div>
        </div>`;
    }).join("");

    // Per-type bars
    const bars = document.getElementById("stats-bars");
    const typeCounts = CHORE_TYPES.map(c => ({
      chore: c,
      count: records.filter(r => r.typeId === c.id).length,
    }));
    const maxType = Math.max(1, ...typeCounts.map(t => t.count));
    bars.innerHTML = typeCounts.map(t => `
      <div class="bar-row">
        <div class="bar-label">${t.chore.emoji} ${t.chore.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(t.count / maxType) * 100}%; background:${t.chore.color}"></div></div>
        <div class="bar-count">${t.count}</div>
      </div>
    `).join("");
  }

  // ---------- Export / Import ----------
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    download(`housework-export-${stamp}.json`, JSON.stringify(records, null, 2), "application/json");
    showToast("📦 JSON 已匯出，請移到 SaveData/ 資料夾");
  }

  function exportCsv() {
    const header = ["id", "項目", "日期", "時間", "備註", "建立時間"];
    const rows = records.map(r => [
      r.id,
      choreById[r.typeId] ? choreById[r.typeId].label : r.typeId,
      r.date,
      r.time,
      (r.memo || "").replace(/"/g, '""'),
      r.createdAt,
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    download(`housework-export-${stamp}.csv`, "﻿" + csv, "text/csv;charset=utf-8;");
    showToast("📦 CSV 已匯出，請移到 SaveData/ 資料夾");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("格式錯誤");
        const valid = data.filter(r => r && r.id && r.typeId && r.date && r.time);
        const existingIds = new Set(records.map(r => r.id));
        const merged = valid.filter(r => !existingIds.has(r.id));
        records = records.concat(merged);
        saveRecords();
        renderBoard();
        renderHistory();
        renderStats();
        showToast(`✅ 已匯入 ${merged.length} 筆紀錄`);
      } catch (e) {
        showToast("❌ 匯入失敗，請確認檔案格式");
        console.error(e);
      }
    };
    reader.readAsText(file);
  }

  function initDataTab() {
    document.getElementById("export-json").addEventListener("click", exportJson);
    document.getElementById("export-csv").addEventListener("click", exportCsv);
    document.getElementById("import-file").addEventListener("change", e => {
      const file = e.target.files[0];
      if (file) importJson(file);
      e.target.value = "";
    });
    document.getElementById("clear-data").addEventListener("click", () => {
      if (confirm("確定要清除全部家事紀錄嗎？此動作無法復原！")) {
        records = [];
        saveRecords();
        renderBoard();
        renderHistory();
        renderStats();
        showToast("🗑️ 已清除全部紀錄");
      }
    });
  }

  // ---------- Utils ----------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  // ---------- Init ----------
  function init() {
    migrateRecords();

    initPasswordLock();
    initTabs();
    initCalendar();
    initPalette();
    initDropzone();
    initMemoModal();
    initHistoryControls();
    initDataTab();

    renderBoard();
    renderHistory();
    renderStats();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
