(function () {
  const cfg = window.BEZ_CONFIG || {};
  const root = document.getElementById("app");
  try {
    const savedTheme = localStorage.getItem("bez-theme");
    if (savedTheme === "dark" || savedTheme === "light") document.documentElement.dataset.theme = savedTheme;
  } catch (storageError) { /* storage blocked: follow the system theme */ }

  // Tiny helper to build elements safely (text is never treated as HTML)
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    kids.flat().forEach(k => e.append(k));
    return e;
  }
  function show(...nodes) { root.replaceChildren(...nodes); }
  function proofButton(path) {
    if (!path) return h("span", { class: "muted" }, "Нет");

    const message = h("span", { class: "error proof-error" });
    const button = h("button", {
      class: "alt proof-button",
      onclick: async () => {
        const popup = window.open("about:blank", "_blank");
        if (!popup) {
          message.textContent = "Разрешите всплывающие окна для просмотра файла";
          return;
        }
        popup.opener = null;
        button.disabled = true;
        message.textContent = "";
        try {
          const { data, error } = await sb.storage.from("proofs").createSignedUrl(path, 60);
          if (error) throw error;
          if (!data || !data.signedUrl) throw new Error("Ссылка на файл не создана");
          popup.location.replace(data.signedUrl);
        } catch (error) {
          popup.close();
          message.textContent = "Не удалось открыть файл: " + (error.message || "ошибка доступа");
        } finally {
          button.disabled = false;
        }
      }
    }, "Подтверждение");
    return h("div", { class: "proof-action" }, button, message);
  }

  const missing = v => !v || v.startsWith("PASTE");
  if (missing(cfg.SUPABASE_URL) || missing(cfg.SUPABASE_KEY)) {
    show(h("div", { class: "card login" },
      h("h1", {}, "Bez"),
      h("p", {}, "Откройте файл config.js и вставьте адрес проекта и ключ Supabase.")));
    return;
  }

  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  const statusText = status => ({
    pending: "Ожидает решения",
    approved: "Одобрено",
    rejected: "Отклонено (не списано)"
  })[status] || status;
  const statusTag = status => h("span", { class: "tag tag-" + status }, statusText(status));
  const som = value => Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " сом";
  const initials = name => (name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  const avatar = name => h("span", { class: "avatar", "aria-hidden": "true" }, initials(name));

  function panel(title, ...content) {
    return h("section", { class: "panel" },
      title ? h("div", { class: "panel-head" }, h("h2", {}, title)) : "",
      ...content);
  }
  function stat(label, value, extra, tone, iconName) {
    return h("div", { class: "stat" + (tone ? " stat-" + tone : "") },
      h("span", { class: "stat-label" }, iconName ? h("span", { class: "stat-icon" }, icon(iconName)) : "", label),
      h("strong", { class: "stat-value" }, value),
      extra || "");
  }
  function meter(used, total) {
    const share = total > 0 ? Math.min(100, Math.max(0, used / total * 100)) : 0;
    return h("div", {
      class: "meter" + (total > 0 && used > total ? " meter-over" : ""),
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(Math.round(share)),
      "aria-label": "Израсходовано от контракта"
    }, h("span", { style: "width:" + share.toFixed(1) + "%" }));
  }
  // ---------- Icons & charts (inline SVG, no libraries) ----------
  const SVG_NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...kids) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    kids.flat().forEach(k => e.append(k));
    return e;
  }
  const ICONS = {
    wallet: "M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 0V6a2 2 0 0 1 2-2h10M16 13h1",
    out: "M7 17 17 7M9 7h8v8",
    in: "M17 7 7 17M15 17H7V9",
    users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8a6 6 0 0 1 12 0M17 11a3 3 0 0 0 0-6m4 14a6 6 0 0 0-3-5.2",
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    file: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
    doc: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
    home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
    check: "M8 4h8v3H8zM6 6H5v15h14V6h-1M9 14l2 2 4-4",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
  };
  const icon = name => s("svg", {
    class: "icon", viewBox: "0 0 24 24", width: "20", height: "20", fill: "none", stroke: "currentColor",
    "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"
  }, s("path", { d: ICONS[name] || "" }));
  const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
  const compact = value => Number(value || 0).toLocaleString("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
  const percent = (value, total) => (total > 0 ? value / total * 100 : 0)
    .toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%";

  const tip = h("div", { class: "chart-tip", role: "status" });
  tip.hidden = true;
  function showTip(x, y, value, ...lines) {
    tip.replaceChildren(h("strong", {}, value), ...lines.filter(Boolean).map(line => h("span", {}, line)));
    tip.hidden = false;
    if (!tip.isConnected) document.body.append(tip);
    const box = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - box.width - 8, Math.max(8, x + 14)) + "px";
    tip.style.top = Math.max(8, y - box.height - 14) + "px";
  }
  function hideTip() { tip.hidden = true; }
  function tipOn(node, value, ...lines) {
    node.addEventListener("pointermove", ev => showTip(ev.clientX, ev.clientY, value, ...lines));
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", () => {
      const box = node.getBoundingClientRect();
      showTip(box.left + box.width / 2, box.top, value, ...lines);
    });
    node.addEventListener("blur", hideTip);
  }

  // Donut: parts = [{ label, value, color }]. The legend carries every name and amount.
  function donut(parts, centerValue, centerLabel, ariaLabel) {
    const shown = parts.filter(part => part.value > 0);
    const total = shown.reduce((sum, part) => sum + part.value, 0);
    const size = 168, radius = 64, width = 20, around = 2 * Math.PI * radius;
    const svg = s("svg", { class: "donut", viewBox: "0 0 " + size + " " + size, role: "img", "aria-label": ariaLabel },
      s("circle", { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: "var(--track)", "stroke-width": width }));
    const gap = shown.length > 1 ? 2 : 0;
    let offset = 0;
    shown.forEach(part => {
      const length = part.value / total * around;
      const segment = s("circle", {
        class: "donut-seg", cx: size / 2, cy: size / 2, r: radius, fill: "none",
        stroke: part.color, "stroke-width": width,
        "stroke-dasharray": Math.max(0.5, length - gap) + " " + around,
        "stroke-dashoffset": String(-offset),
        transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")",
        tabindex: "0", role: "img",
        "aria-label": part.label + ": " + som(part.value) + ", " + percent(part.value, total)
      });
      tipOn(segment, som(part.value), part.label, percent(part.value, total));
      svg.append(segment);
      offset += length;
    });
    return h("div", { class: "donut-chart" },
      h("div", { class: "donut-wrap" }, svg,
        h("div", { class: "donut-center" }, h("strong", {}, centerValue), h("span", { class: "muted" }, centerLabel))),
      h("ul", { class: "legend" }, ...parts.map(part => h("li", {},
        h("span", { class: "swatch", style: "background:" + part.color }),
        h("span", { class: "legend-name" }, part.label),
        h("strong", {}, som(part.value)),
        h("span", { class: "muted" }, percent(part.value, total))))));
  }

  // Columns: items = [{ label, value, note }]
  function columns(items, ariaLabel) {
    const max = Math.max(1, ...items.map(item => item.value));
    return h("div", { class: "columns", role: "group", "aria-label": ariaLabel }, ...items.map(item => {
      const bar = h("span", { class: "column-bar", style: "height:" + (item.value / max * 100).toFixed(1) + "%" });
      const column = h("div", { class: "column", tabindex: "0", "aria-label": item.label + ": " + som(item.value) },
        h("span", { class: "column-value" }, item.value ? compact(item.value) : ""),
        h("span", { class: "column-track" }, bar),
        h("span", { class: "column-label" }, item.label));
      tipOn(column, som(item.value), item.note || item.label);
      return column;
    }));
  }

  // Line over time: points = [{ t (ms), v, note }], oldest first. Stepped, because money changes at each event.
  function lineChart(points, ariaLabel) {
    const box = h("div", { class: "line-chart" });
    const until = Date.now();
    function draw() {
      const W = Math.max(280, box.clientWidth || 600), H = 230;
      const m = { l: 54, r: 18, t: 14, b: 28 };
      const t0 = points[0].t, t1 = Math.max(until, points[points.length - 1].t + 1);
      const values = points.map(point => point.v);
      const low = Math.min(0, ...values), high = Math.max(...values, low + 1);
      const rough = (high - low) / 3, power = Math.pow(10, Math.floor(Math.log10(rough)));
      const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= rough) || rough;
      const lo = Math.floor(low / step) * step, hi = Math.ceil(high / step) * step;
      const x = t => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r);
      const y = v => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
      let d = "M" + x(points[0].t).toFixed(1) + " " + y(points[0].v).toFixed(1);
      points.slice(1).forEach(point => { d += " H" + x(point.t).toFixed(1) + " V" + y(point.v).toFixed(1); });
      d += " H" + x(t1).toFixed(1);
      const last = points[points.length - 1];
      const svg = s("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", tabindex: "0", "aria-label": ariaLabel });
      for (let tick = lo; tick <= hi + step / 2; tick += step) {
        svg.append(
          s("line", { class: "grid-line", x1: m.l, x2: W - m.r, y1: y(tick), y2: y(tick) }),
          s("text", { class: "axis-text", x: m.l - 8, y: y(tick) + 4, "text-anchor": "end" }, compact(tick)));
      }
      svg.append(
        s("text", { class: "axis-text", x: m.l, y: H - 8 }, new Date(t0).toLocaleDateString("ru-RU")),
        s("text", { class: "axis-text", x: W - m.r, y: H - 8, "text-anchor": "end" }, "сегодня"),
        s("path", { class: "area", d: d + " V" + y(Math.max(lo, 0)).toFixed(1) + " H" + x(t0).toFixed(1) + " Z" }),
        s("path", { class: "line", d }));
      const cross = s("line", { class: "cross", y1: m.t, y2: H - m.b, visibility: "hidden" });
      const dot = s("circle", { class: "end-dot", r: 4.5, cx: x(t1), cy: y(last.v) });
      svg.append(cross, dot);
      let index = points.length - 1;
      function focusPoint(i, clientX, clientY) {
        index = Math.max(0, Math.min(points.length - 1, i));
        const point = points[index];
        cross.setAttribute("x1", x(point.t)); cross.setAttribute("x2", x(point.t));
        cross.setAttribute("visibility", "visible");
        dot.setAttribute("cx", x(point.t)); dot.setAttribute("cy", y(point.v));
        const rect = svg.getBoundingClientRect();
        showTip(clientX === undefined ? rect.left + x(point.t) : clientX,
          clientY === undefined ? rect.top + y(point.v) : clientY,
          som(point.v), new Date(point.t).toLocaleString("ru-RU"), point.note);
      }
      function reset() {
        cross.setAttribute("visibility", "hidden");
        dot.setAttribute("cx", x(t1)); dot.setAttribute("cy", y(last.v));
        hideTip();
      }
      svg.addEventListener("pointermove", ev => {
        const rect = svg.getBoundingClientRect();
        const t = t0 + (ev.clientX - rect.left - m.l) / (W - m.l - m.r) * (t1 - t0);
        let nearest = 0;
        points.forEach((point, i) => { if (point.t <= t) nearest = i; });
        focusPoint(nearest, ev.clientX, ev.clientY);
      });
      svg.addEventListener("pointerleave", reset);
      svg.addEventListener("blur", reset);
      svg.addEventListener("keydown", ev => {
        if (ev.key === "ArrowLeft") { ev.preventDefault(); focusPoint(index - 1); }
        if (ev.key === "ArrowRight") { ev.preventDefault(); focusPoint(index + 1); }
      });
      box.replaceChildren(svg);
    }
    if (window.ResizeObserver) {
      let lastWidth = 0;
      new ResizeObserver(() => {
        if (box.clientWidth && box.clientWidth !== lastWidth) { lastWidth = box.clientWidth; draw(); }
      }).observe(box);
    }
    // First paint without waiting for the observer (it can be delayed in a background tab)
    setTimeout(() => { if (!box.firstChild) draw(); }, 0);
    return box;
  }

  // Warns the admin when a contract is overspent or nearly used up (less than 20% left).
  function budgetTag(total, spent) {
    if (!(total > 0)) return null;
    if (spent > total) return h("span", { class: "tag tag-rejected" }, "Перерасход " + som(spent - total));
    if (total - spent < total * 0.2) return h("span", { class: "tag tag-pending" }, "Осталось меньше 20%");
    return null;
  }
  function csvCell(value) {
    let text = value === null || value === undefined ? "" : String(value);
    // Stop spreadsheet apps from running text that looks like a formula
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function downloadCsv(filename, rows) {
    const content = "﻿" + rows.map(row => row.join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = h("a", { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Contract table is created by project-contract.sql; until it exists, show a hint instead of failing.
  const contractTableMissing = error => !!error && (error.code === "42P01" || error.code === "PGRST205"
    || /project_contracts/.test(error.message || ""));

  async function fetchAll(table, columns) {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await sb.from(table).select(columns).order("id").range(offset, offset + pageSize - 1);
      if (error) return { data: null, error };
      rows.push(...data);
      if (data.length < pageSize) return { data: rows, error: null };
    }
  }

  async function insertRow(table, values) {
    const { error } = await sb.from(table).insert(values);
    if (error) throw error;
  }

  // ---------- Login ----------
  function renderLogin() {
    const email = h("input", { type: "email", placeholder: "Эл. почта", autocomplete: "username", required: "" });
    const pass = h("input", { type: "password", placeholder: "Пароль", autocomplete: "current-password", required: "" });
    const err = h("p", { class: "error" });
    const btn = h("button", { type: "submit" }, "Войти");
    const form = h("form", {
      onsubmit: async ev => {
        ev.preventDefault();
        btn.disabled = true; err.textContent = "";
        const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        btn.disabled = false;
        if (error) err.textContent = "Неверная почта или пароль";
      }
    }, email, pass, err, btn);
    show(h("div", { class: "card login" },
      h("h1", {}, "Bez"),
      h("p", { class: "muted" }, "Учёт денег по проектам"),
      form));
  }

  // ---------- Theme (light / dark), remembered on this device ----------
  const THEME_KEY = "bez-theme";
  function currentTheme() {
    return document.documentElement.dataset.theme
      || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (storageError) { /* private mode: theme lasts until reload */ }
  }
  function themeToggle() {
    const button = h("button", { type: "button", class: "nav-item theme-toggle" });
    function paint() {
      const dark = currentTheme() === "dark";
      button.replaceChildren(icon(dark ? "sun" : "moon"), h("span", { class: "nav-label" }, dark ? "Светлая тема" : "Тёмная тема"));
    }
    button.addEventListener("click", () => { applyTheme(currentTheme() === "dark" ? "light" : "dark"); paint(); });
    paint();
    return button;
  }

  // ---------- Home (depends on role) ----------
  async function renderHome(user) {
    show(h("p", { class: "muted loading" }, "Загрузка…"));
    const { data: profile, error } = await sb.from("profiles")
      .select("full_name, role").eq("id", user.id).single();
    const logout = h("button", { class: "alt", onclick: () => sb.auth.signOut() }, "Выйти");
    if (error || !profile) {
      show(h("div", { class: "card login" },
        h("p", { class: "error" }, "Не удалось загрузить профиль."), logout));
      return;
    }
    const isAdmin = profile.role === "admin";
    const displayName = profile.full_name || user.email;
    logout.className = "alt logout";

    const sections = isAdmin ? [
      { key: "overview", label: "Обзор", icon: "home", render: adminOverview },
      { key: "projects", label: "Проекты", icon: "grid", render: adminProjects },
      { key: "pending", label: "На проверке", icon: "check", render: adminPending },
      { key: "workers", label: "Сотрудники", icon: "users", render: adminWorkers }
    ] : [
      { key: "projects", label: "Мои проекты", icon: "grid", render: workerView }
    ];
    const body = h("div", { class: "content" });
    const title = h("strong", { class: "topbar-title" });
    const pendingBadge = h("span", { class: "nav-badge" });
    pendingBadge.hidden = true;
    const projectLinks = h("div", { class: "nav nav-projects" });
    const buttons = {};
    const markActive = key => Object.entries(buttons).forEach(([name, button]) => {
      button.classList.toggle("active", name === key);
      if (name === key) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    const nav = {
      go(key) {
        const section = sections.find(item => item.key === key) || sections[0];
        markActive(section.key);
        title.textContent = section.label;
        hideTip();
        body.replaceChildren(h("p", { class: "muted" }, "Загрузка…"));
        return section.render(body, user, nav);
      },
      openProject(project) {
        markActive("projects");
        title.textContent = "Проекты";
        hideTip();
        return projectView(body, project, () => nav.go("projects"), user);
      },
      setPending(count) {
        pendingBadge.hidden = !count;
        pendingBadge.textContent = count ? String(count) : "";
        pendingBadge.setAttribute("aria-label", "Ждут решения: " + count);
      },
      setProjects(projects) {
        projectLinks.replaceChildren(
          h("span", { class: "nav-heading" }, "Проекты"),
          ...projects.slice(0, 8).map(project => h("button", {
            type: "button", class: "nav-item nav-project", onclick: () => nav.openProject(project)
          }, h("span", { class: "nav-dot", "aria-hidden": "true" }), h("span", { class: "nav-label" }, project.name))));
        projectLinks.hidden = !projects.length;
      }
    };
    projectLinks.hidden = true;

    const sidebar = h("aside", { class: "sidebar" },
      h("div", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "B"), "Bez"),
      h("nav", { class: "nav", "aria-label": "Разделы" },
        h("span", { class: "nav-heading" }, "Меню"),
        ...sections.map(section => (buttons[section.key] = h("button", {
          type: "button", class: "nav-item", onclick: () => nav.go(section.key)
        }, icon(section.icon), h("span", { class: "nav-label" }, section.label),
        section.key === "pending" ? pendingBadge : "")))),
      isAdmin ? projectLinks : "",
      h("div", { class: "sidebar-foot" },
        themeToggle(),
        h("div", { class: "sidebar-user" },
          avatar(displayName),
          h("div", { class: "sidebar-user-text" },
            h("strong", {}, displayName),
            h("span", { class: "muted" }, isAdmin ? "Администратор" : "Сотрудник")),
          logout)));
    const topbar = h("header", { class: "topbar" },
      title,
      h("span", { class: "muted" }, new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })));
    show(h("div", { class: "shell" }, sidebar, h("main", { class: "main" }, topbar, body)));
    await nav.go(sections[0].key);
  }

  // ---------- Admin: shared data for overview, projects and review pages ----------
  async function loadAdminData(nav) {
    const [projectsResult, contractsResult, expensesResult, peopleResult] = await Promise.all([
      sb.from("projects").select("id, name, created_at").order("created_at", { ascending: false }),
      sb.from("project_contracts").select("project_id, amount"),
      fetchAll("expenses", "id, project_id, worker_id, amount, reason, status, proof_path, created_at"),
      sb.from("profiles").select("id, full_name, role")
    ]);
    const projects = projectsResult.data || [];
    const contracts = contractsResult.error ? [] : (contractsResult.data || []);
    const expenses = expensesResult.error ? [] : (expensesResult.data || []);
    const people = peopleResult.data || [];
    const counted = expenses.filter(expense => expense.status !== "rejected");
    const pending = expenses.filter(expense => expense.status === "pending");
    const spentBy = {}, pendingBy = {};
    counted.forEach(expense => { spentBy[expense.project_id] = (spentBy[expense.project_id] || 0) + Number(expense.amount || 0); });
    pending.forEach(expense => { pendingBy[expense.project_id] = (pendingBy[expense.project_id] || 0) + 1; });
    const contractTotal = contracts.reduce((total, item) => total + Number(item.amount || 0), 0);
    const spentOnContracts = contracts.reduce((total, item) => total + (spentBy[item.project_id] || 0), 0);
    nav.setPending(pending.length);
    nav.setProjects(projects);
    return {
      projects, contracts, expenses, people, counted, pending, spentBy, pendingBy, contractTotal, spentOnContracts,
      projectsError: projectsResult.error, contractsError: contractsResult.error, expensesError: expensesResult.error,
      nameOf: id => (people.find(person => person.id === id) || {}).full_name || "Без имени",
      projectName: id => (projects.find(project => project.id === id) || {}).name || "Проект",
      contractOf: id => contracts.find(item => item.project_id === id)
    };
  }
  function contractNotices(data) {
    const notices = [];
    if (data.projectsError) notices.push(h("p", { class: "error" }, "Не удалось загрузить проекты"));
    if (contractTableMissing(data.contractsError)) {
      notices.push(h("p", { class: "notice" }, "Контракты пока недоступны: выполните project-contract.sql в Supabase SQL Editor."));
    } else if (data.contractsError) {
      notices.push(h("p", { class: "error" }, "Не удалось загрузить контракты: " + data.contractsError.message));
    }
    if (data.expensesError) notices.push(h("p", { class: "error" }, "Не удалось загрузить расходы для подсчёта остатка"));
    return notices;
  }
  const dateTime = value => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  function dataTable(headers, rows, emptyText) {
    return h("div", { class: "table-wrap" },
      h("table", {},
        h("thead", {}, h("tr", {}, ...headers.map(header => h("th", {}, header)))),
        h("tbody", {}, rows.length ? rows : [
          h("tr", {}, h("td", { colspan: String(headers.length), class: "muted" }, emptyText))
        ])));
  }

  // One pending expense with approve / reject. onDone runs after the decision is saved.
  function decisionCard(expense, workerName, subtitle, onDone) {
    const comment = h("input", {
      type: "text",
      maxlength: "300",
      placeholder: "Комментарий (для отклонения)",
      "aria-label": "Комментарий к расходу"
    });
    const error = h("p", { class: "error" });
    const approve = h("button", { type: "button", onclick: () => decide("approved") }, "Одобрить");
    const reject = h("button", { type: "button", class: "alt", onclick: () => decide("rejected") }, "Отклонить");

    async function decide(status) {
      error.textContent = "";
      approve.disabled = true;
      reject.disabled = true;
      const { error: updateError } = await sb.from("expenses")
        .update({
          status,
          admin_comment: status === "rejected" ? (comment.value.trim() || null) : null
        })
        .eq("id", expense.id)
        .eq("status", "pending");
      if (updateError) {
        error.textContent = "Не удалось сохранить решение: " + updateError.message;
        approve.disabled = false;
        reject.disabled = false;
        return;
      }
      await onDone();
    }

    return h("div", { class: "pending-item" },
      h("div", { class: "person-row" },
        avatar(workerName),
        h("div", { class: "person-text" },
          h("strong", {}, workerName),
          h("span", { class: "muted" }, subtitle)),
        h("strong", { class: "amount-out" }, "−" + som(Number(expense.amount)))),
      proofButton(expense.proof_path),
      comment,
      h("div", { class: "row" }, approve, reject),
      error);
  }

  // ---------- Admin: overview ----------
  async function adminOverview(body, user, nav) {
    const data = await loadAdminData(nav);
    const now = new Date();
    const months = [];
    for (let back = 5; back >= 0; back -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
      months.push({
        key: start.getFullYear() + "-" + start.getMonth(),
        label: start.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
        note: start.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
        value: 0
      });
    }
    data.counted.forEach(expense => {
      const at = new Date(expense.created_at);
      const month = months.find(item => item.key === at.getFullYear() + "-" + at.getMonth());
      if (month) month.value += Number(expense.amount || 0);
    });
    const noContracts = !!data.contractsError;
    const charts = h("div", { class: "chart-grid" },
      panel("Расходы по месяцам", columns(months, "Расходы сотрудников за последние шесть месяцев")));
    if (!noContracts && data.contractTotal > 0) {
      const contracted = new Set(data.contracts.map(item => item.project_id));
      const onContracts = data.counted.filter(expense => contracted.has(expense.project_id));
      const pendingSum = onContracts.filter(expense => expense.status === "pending")
        .reduce((total, expense) => total + Number(expense.amount || 0), 0);
      const approvedSum = onContracts.reduce((total, expense) => total + Number(expense.amount || 0), 0) - pendingSum;
      charts.append(panel("Бюджет всех контрактов", donut([
        { label: "Одобренные расходы", value: approvedSum, color: "var(--s1)" },
        { label: "Ждут решения", value: pendingSum, color: "var(--s2)" },
        { label: "Остаток", value: Math.max(0, data.contractTotal - data.spentOnContracts), color: "var(--rest)" }
      ], percent(data.spentOnContracts, data.contractTotal), "израсходовано", "Как израсходованы все контракты")));
    }
    const recent = data.expenses.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
    const reviewLink = h("button", { type: "button", class: "alt small", onclick: () => nav.go("pending") }, "Открыть проверку");

    body.replaceChildren(
      ...contractNotices(data),
      h("div", { class: "stats" },
        stat("Остаток по контрактам", noContracts ? "—" : som(data.contractTotal - data.spentOnContracts),
          noContracts ? "" : meter(data.spentOnContracts, data.contractTotal), "accent", "wallet"),
        stat("Сумма контрактов", noContracts ? "—" : som(data.contractTotal), "", "", "doc"),
        stat("Расходы за этот месяц", som(months[months.length - 1].value), "", "", "out"),
        stat("На проверке", String(data.pending.length), data.pending.length ? reviewLink : "", "", "check")),
      charts,
      panel("Последние расходы", dataTable(["Дата", "Проект", "Сотрудник", "Причина", "Статус", "Сумма"], recent.map(expense =>
        h("tr", {},
          h("td", {}, dateTime(expense.created_at)),
          h("td", {}, data.projectName(expense.project_id)),
          h("td", {}, data.nameOf(expense.worker_id)),
          h("td", {}, expense.reason),
          h("td", {}, statusTag(expense.status)),
          h("td", { class: "num" + (expense.status === "rejected" ? " muted" : "") },
            (expense.status === "rejected" ? "" : "−") + som(Number(expense.amount))))), "Расходов пока нет.")));
  }

  // ---------- Admin: all projects + create ----------
  async function adminProjects(body, user, nav) {
    const msg = h("p", { class: "error" });
    const name = h("input", { type: "text", placeholder: "Название проекта, напр. Кайнар", maxlength: "80", "aria-label": "Название проекта", required: "" });
    const contract = h("input", { type: "number", min: "0", step: "0.01", placeholder: "Сумма контракта, сом", "aria-label": "Сумма контракта, сом" });
    const create = h("button", { type: "submit" }, "Создать проект");
    const form = h("form", {
      class: "create-form",
      onsubmit: async ev => {
        ev.preventDefault();
        const n = name.value.trim();
        const amount = contract.value === "" ? null : Number(contract.value);
        if (!n) return;
        if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
          msg.textContent = "Сумма контракта не может быть отрицательной";
          return;
        }
        msg.textContent = "";
        create.disabled = true;
        const { data: created, error } = await sb.from("projects")
          .insert({ name: n, created_by: user.id }).select("id").single();
        if (error) { msg.textContent = "Не удалось создать проект"; create.disabled = false; return; }
        if (amount !== null) {
          const { error: contractError } = await sb.from("project_contracts")
            .upsert({ project_id: created.id, amount });
          if (contractError) {
            msg.textContent = contractTableMissing(contractError)
              ? "Проект создан, но контракт не сохранён: выполните project-contract.sql в Supabase"
              : "Проект создан, но контракт не сохранён: " + contractError.message;
          }
        }
        name.value = "";
        contract.value = "";
        create.disabled = false;
        await load();
      }
    }, name, contract, create);
    const grid = h("div", { class: "project-grid" }, h("p", { class: "muted" }, "Загрузка…"));

    async function load() {
      const data = await loadAdminData(nav);
      grid.replaceChildren(...contractNotices(data));
      if (!data.projects.length && !data.projectsError) {
        grid.append(h("p", { class: "muted" }, "Проектов пока нет. Создайте первый."));
        return;
      }
      data.projects.forEach(p => {
        const item = data.contractOf(p.id);
        const spent = data.spentBy[p.id] || 0;
        const total = item ? Number(item.amount || 0) : 0;
        const badges = [];
        if (data.pendingBy[p.id]) badges.push(h("span", { class: "tag tag-pending" }, "Ждут решения: " + data.pendingBy[p.id]));
        const budgetBadge = item ? budgetTag(total, spent) : null;
        if (budgetBadge) badges.push(budgetBadge);
        grid.append(h("button", {
          type: "button",
          class: "project-card",
          onclick: () => nav.openProject(p)
        },
          h("span", { class: "project-card-head" },
            h("strong", {}, p.name),
            h("span", { class: "muted" }, new Date(p.created_at).toLocaleDateString("ru-RU"))),
          item
            ? [
              h("span", { class: "project-card-label muted" }, "Остаток контракта"),
              h("span", { class: "project-card-value" + (total - spent < 0 ? " negative" : "") }, som(total - spent)),
              meter(spent, total),
              h("span", { class: "muted" }, "Израсходовано " + som(spent) + " из " + som(total))
            ]
            : [
              h("span", { class: "project-card-label muted" }, "Контракт не задан"),
              h("span", { class: "muted" }, "Расходы: " + som(spent))
            ],
          badges.length ? h("span", { class: "badges" }, ...badges) : ""));
      });
    }

    body.replaceChildren(panel("Новый проект", form, msg), grid);
    await load();
  }

  // ---------- Admin: every expense waiting for a decision, across projects ----------
  async function adminPending(body, user, nav) {
    const data = await loadAdminData(nav);
    const queue = data.pending.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const total = queue.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    body.replaceChildren(
      ...contractNotices(data).filter(node => node.className === "error"),
      h("div", { class: "stats" },
        stat("Ждут решения", String(queue.length), "", "accent", "check"),
        stat("На сумму", som(total), "", "", "out")),
      panel("Расходы на проверке",
        ...(queue.length
          ? queue.map(expense => decisionCard(expense, data.nameOf(expense.worker_id),
            data.projectName(expense.project_id) + " · " + expense.reason + " · " + dateTime(expense.created_at),
            () => nav.go("pending")))
          : [h("p", { class: "muted empty" }, "Все расходы проверены.")])));
  }

  // ---------- Admin: workers and the money they hold ----------
  async function adminWorkers(body, user, nav) {
    const [data, balancesResult, membersResult] = await Promise.all([
      loadAdminData(nav),
      sb.from("balances").select("worker_id, project_id, balance"),
      sb.from("project_members").select("project_id, user_id")
    ]);
    const workers = data.people.filter(person => person.role === "worker")
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "ru"));
    const balances = balancesResult.data || [];
    const members = membersResult.data || [];
    const rows = workers.map(worker => {
      const inProjects = members.filter(member => member.user_id === worker.id).map(member => data.projectName(member.project_id));
      const spent = data.counted.filter(expense => expense.worker_id === worker.id)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const onHand = balances.filter(item => item.worker_id === worker.id)
        .reduce((sum, item) => sum + Number(item.balance || 0), 0);
      return { worker, inProjects, spent, onHand };
    });
    body.replaceChildren(
      balancesResult.error || membersResult.error
        ? h("p", { class: "error" }, "Не удалось загрузить балансы или состав проектов")
        : "",
      h("div", { class: "stats" },
        stat("Сотрудников", String(workers.length), "", "accent", "users"),
        stat("На руках у сотрудников", som(rows.reduce((sum, row) => sum + row.onHand, 0)), "", "", "wallet"),
        stat("Расходы сотрудников", som(rows.reduce((sum, row) => sum + row.spent, 0)), "", "", "out")),
      panel("Сотрудники", dataTable(["Сотрудник", "Проекты", "Расходы", "На руках"], rows.map(row =>
        h("tr", {},
          h("td", {}, h("div", { class: "person-row" }, avatar(row.worker.full_name || "Без имени"),
            h("strong", {}, row.worker.full_name || "Без имени"))),
          h("td", {}, row.inProjects.length ? row.inProjects.join(", ") : h("span", { class: "muted" }, "Нет проектов")),
          h("td", { class: "num" }, som(row.spent)),
          h("td", { class: "num" + (row.onHand < 0 ? " negative" : "") }, som(row.onHand)))),
      "Сотрудников пока нет. Создайте пользователя с ролью worker в Supabase.")),
      h("p", { class: "hint" }, "Чтобы добавить сотрудника в проект, откройте проект и выберите его в списке."));
  }

  // ---------- Admin: one project page ----------
  async function projectView(body, project, back, user) {
    const list = h("div", { class: "project-layout" }, h("p", { class: "muted" }, "Загрузка…"));
    const headRow = h("div", { class: "page-head-row" }, h("h1", {}, project.name));
    body.replaceChildren(
      h("div", { class: "page-head" },
        h("button", { type: "button", class: "alt back", onclick: back }, "← Все проекты"),
        headRow),
      list);

    async function loadAllRows(table, columns) {
      const rows = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await sb.from(table).select(columns)
          .eq("project_id", project.id).order("created_at", { ascending: false }).order("id")
          .range(offset, offset + pageSize - 1);
        if (error) return { data: null, error };
        rows.push(...data);
        if (data.length < pageSize) return { data: rows, error: null };
      }
    }

    const [
      { data: members, error: membersError },
      { data: transfers, error: transfersError },
      { data: expenses, error: expensesError },
      { data: balances, error: balancesError },
      { data: contract, error: contractError }
    ] = await Promise.all([
      sb.from("project_members").select("user_id").eq("project_id", project.id),
      loadAllRows("transfers", "worker_id, amount, note, proof_path, created_at"),
      loadAllRows("expenses", "id, worker_id, amount, reason, proof_path, status, admin_comment, created_at"),
      sb.from("balances").select("worker_id, balance").eq("project_id", project.id),
      sb.from("project_contracts").select("amount").eq("project_id", project.id).maybeSingle()
    ]);
    if (membersError || transfersError || expensesError || balancesError) {
      const failed = [
        ["project_members", membersError],
        ["transfers", transfersError],
        ["expenses", expensesError],
        ["balances", balancesError]
      ].filter(item => item[1]).map(item => item[0] + ": " + (item[1].message || item[1].code));
      list.replaceChildren(h("p", { class: "error" }, "Не удалось загрузить историю проекта и балансы"),
        h("p", { class: "muted" }, failed.join(" | ")));
      return;
    }

    const ids = [...new Set([
      ...members.map(member => member.user_id),
      ...transfers.map(transfer => transfer.worker_id),
      ...expenses.map(expense => expense.worker_id)
    ])];
    let people = [];
    if (ids.length) {
      const { data, error } = await sb.from("profiles").select("id, full_name").in("id", ids);
      if (error) {
        list.replaceChildren(h("p", { class: "error" }, "Не удалось загрузить имена сотрудников"));
        return;
      }
      people = data || [];
    }

    const nameOf = id => (people.find(person => person.id === id) || {}).full_name || "Без имени";
    const balanceOf = id => Number((balances || []).find(balance => balance.worker_id === id)?.balance || 0);
    const addedTotal = transfers.reduce((total, transfer) => total + Number(transfer.amount || 0), 0);
    const deductedTotal = expenses
      .filter(expense => expense.status !== "rejected")
      .reduce((total, expense) => total + Number(expense.amount || 0), 0);
    const pendingTotal = expenses
      .filter(expense => expense.status === "pending")
      .reduce((total, expense) => total + Number(expense.amount || 0), 0);
    const money = som;
    const date = value => new Date(value).toLocaleString("ru-RU");
    const table = (headers, rows, emptyText) => h("div", { class: "table-wrap" },
      h("table", {},
        h("thead", {}, h("tr", {}, ...headers.map(header => h("th", {}, header)))),
        h("tbody", {}, rows.length ? rows : [
          h("tr", {}, h("td", { colspan: String(headers.length), class: "muted" }, emptyText))
        ])));

    const currentMembers = members.map(member => member.user_id);

    const pendingCard = expense => decisionCard(expense, nameOf(expense.worker_id),
      expense.reason + " · " + date(expense.created_at), () => projectView(body, project, back, user));

    // ----- Contract (admin only; protected by RLS in project-contract.sql) -----
    const contractAmount = contract ? Number(contract.amount || 0) : null;
    const contractLeft = contractAmount === null ? null : contractAmount - deductedTotal;
    const contractInput = h("input", {
      type: "number", min: "0", step: "0.01",
      placeholder: "Сумма контракта, сом",
      "aria-label": "Сумма контракта, сом",
      value: contractAmount === null ? "" : String(contractAmount),
      required: ""
    });
    const contractMsg = h("p", { class: "error" });
    const contractSave = h("button", { type: "submit" }, contractAmount === null ? "Задать контракт" : "Сохранить");
    const contractForm = h("form", {
      class: "row",
      onsubmit: async ev => {
        ev.preventDefault();
        const value = Number(contractInput.value);
        if (contractInput.value === "" || !Number.isFinite(value) || value < 0) {
          contractMsg.textContent = "Введите сумму контракта, ноль или больше";
          return;
        }
        contractMsg.textContent = "";
        contractSave.disabled = true;
        const { error: saveError } = await sb.from("project_contracts").upsert({ project_id: project.id, amount: value });
        if (saveError) {
          contractMsg.textContent = contractTableMissing(saveError)
            ? "Сначала выполните project-contract.sql в Supabase SQL Editor"
            : "Не удалось сохранить контракт: " + saveError.message;
          contractSave.disabled = false;
          return;
        }
        await projectView(body, project, back, user);
      }
    }, contractInput, contractSave);

    let contractStat;
    if (contractError && contractTableMissing(contractError)) {
      contractStat = stat("Остаток контракта", "—",
        h("span", { class: "stat-note" }, "Выполните project-contract.sql в Supabase"), "accent");
    } else if (contractError) {
      contractStat = stat("Остаток контракта", "—",
        h("span", { class: "stat-note error" }, contractError.message), "accent");
    } else if (contractAmount === null) {
      contractStat = stat("Остаток контракта", "Не задан",
        h("span", { class: "stat-note" }, "Укажите сумму контракта ниже"), "accent");
    } else {
      contractStat = stat("Остаток контракта", money(contractLeft),
        [meter(deductedTotal, contractAmount),
          h("span", { class: "stat-note" }, "Израсходовано " + money(deductedTotal) + " из " + money(contractAmount))],
        contractLeft < 0 ? "accent negative" : "accent");
    }

    contractStat.querySelector(".stat-label").prepend(h("span", { class: "stat-icon" }, icon("wallet")));

    // ----- Spending by worker -----
    const spentByWorker = {};
    expenses.filter(expense => expense.status !== "rejected").forEach(expense => {
      const entry = spentByWorker[expense.worker_id] || (spentByWorker[expense.worker_id] = { total: 0, count: 0 });
      entry.total += Number(expense.amount || 0);
      entry.count += 1;
    });
    const shareBase = contractAmount > 0 ? contractAmount : deductedTotal;
    const shareLabel = contractAmount > 0 ? "% контракта" : "% расходов";
    // Colour follows the worker (fixed order by id), never the ranking; past six, the rest share "Другие".
    const colorOf = {};
    Object.keys(spentByWorker).sort().forEach((id, i) => { colorOf[id] = i < SERIES.length - 1 ? SERIES[i] : "var(--rest)"; });
    const ranked = Object.entries(spentByWorker).sort((a, b) => b[1].total - a[1].total);
    const workerParts = ranked.filter(([id]) => colorOf[id] !== "var(--rest)")
      .map(([id, entry]) => ({ label: nameOf(id), value: entry.total, color: colorOf[id] }));
    const othersTotal = ranked.filter(([id]) => colorOf[id] === "var(--rest)").reduce((sum, item) => sum + item[1].total, 0);
    if (othersTotal) workerParts.push({ label: "Другие", value: othersTotal, color: "var(--rest)" });

    // ----- Line: what is left of the contract after each expense (or total spent, with no contract) -----
    const timeline = expenses.filter(expense => expense.status !== "rejected")
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const hasContract = contractAmount !== null;
    let running = hasContract ? contractAmount : 0;
    const linePoints = timeline.length ? [{
      t: new Date(timeline[0].created_at).getTime() - 12 * 3600 * 1000,
      v: running,
      note: hasContract ? "Контракт до расходов" : "До расходов"
    }] : [];
    timeline.forEach(expense => {
      running += (hasContract ? -1 : 1) * Number(expense.amount || 0);
      linePoints.push({
        t: new Date(expense.created_at).getTime(),
        v: running,
        note: nameOf(expense.worker_id) + ": " + expense.reason + ", −" + money(Number(expense.amount))
      });
    });
    const lineTitle = hasContract ? "Остаток контракта по дням" : "Расходы нарастающим итогом";

    const breakdown = ranked.map(([id, entry]) =>
      h("div", { class: "breakdown-row" },
        h("div", { class: "person-row" },
          h("span", { class: "swatch", style: "background:" + colorOf[id] }),
          avatar(nameOf(id)),
          h("div", { class: "person-text" },
            h("strong", {}, nameOf(id)),
            h("span", { class: "muted" }, "Расходов: " + entry.count + " · "
              + (shareBase > 0 ? (entry.total / shareBase * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "0") + shareLabel)),
          h("strong", { class: "amount-out" }, "−" + money(entry.total))),
        meter(entry.total, shareBase)));

    // ----- CSV report for the accountant -----
    const csvNumber = value => String(Math.round(Number(value || 0) * 100) / 100).replace(".", ",");
    const exportButton = h("button", {
      type: "button",
      class: "alt",
      onclick: () => {
        const rows = [
          ...transfers.map(transfer => ({
            at: transfer.created_at,
            cells: [csvCell(date(transfer.created_at)), csvCell("Пополнение"), csvCell(nameOf(transfer.worker_id)),
              csvCell(transfer.note || ""), csvCell(""), csvNumber(transfer.amount), csvNumber(0)]
          })),
          ...expenses.map(expense => ({
            at: expense.created_at,
            cells: [csvCell(date(expense.created_at)), csvCell("Расход"), csvCell(nameOf(expense.worker_id)),
              csvCell(expense.reason + (expense.admin_comment ? " (" + expense.admin_comment + ")" : "")),
              csvCell(statusText(expense.status)), csvNumber(expense.amount),
              csvNumber(expense.status === "rejected" ? 0 : -Number(expense.amount || 0))]
          }))
        ].sort((a, b) => new Date(a.at) - new Date(b.at)).map(row => row.cells);
        const summaryRows = [
          [],
          [csvCell("Проект"), csvCell(project.name)],
          [csvCell("Контракт, сом"), contractAmount === null ? csvCell("не задан") : csvNumber(contractAmount)],
          [csvCell("Расходы (без отклонённых), сом"), csvNumber(deductedTotal)],
          [csvCell("Остаток контракта, сом"), contractAmount === null ? csvCell("—") : csvNumber(contractLeft)],
          [csvCell("Выдано сотрудникам, сом"), csvNumber(addedTotal)]
        ];
        const safeName = project.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "project";
        downloadCsv("bez-" + safeName + "-" + new Date().toISOString().slice(0, 10) + ".csv", [
          ["Дата", "Тип", "Сотрудник", "Описание", "Статус", "Сумма, сом", "Списано с контракта, сом"].map(csvCell),
          ...rows,
          ...summaryRows
        ]);
      }
    }, "Скачать отчёт (CSV)");
    headRow.append(exportButton);

    const budgetWarning = contractAmount === null ? null : budgetTag(contractAmount, deductedTotal);
    if (budgetWarning) contractStat.append(budgetWarning);

    const pendingExpenses = expenses.filter(expense => expense.status === "pending");
    list.replaceChildren(
      h("div", { class: "stats" },
        contractStat,
        stat("Расходы сотрудников", money(deductedTotal),
          pendingTotal ? h("span", { class: "stat-note" }, "из них ждут решения: " + money(pendingTotal)) : "", "", "out"),
        stat("Выдано сотрудникам", money(addedTotal), "", "", "in"),
        stat("На руках у сотрудников", money(addedTotal - deductedTotal), "", "", "users")),
      h("p", { class: "hint" }, "Остаток контракта видит только администратор. Расходы в ожидании уже вычтены; отклонённые возвращаются в остаток."),
      h("div", { class: "chart-grid" },
        panel(lineTitle, linePoints.length
          ? lineChart(linePoints, lineTitle)
          : h("p", { class: "muted empty" }, "График появится после первого расхода.")),
        hasContract && contractAmount > 0
          ? panel("Бюджет контракта", donut([
            { label: "Одобренные расходы", value: deductedTotal - pendingTotal, color: "var(--s1)" },
            { label: "Ждут решения", value: pendingTotal, color: "var(--s2)" },
            { label: "Остаток", value: Math.max(0, contractLeft), color: "var(--rest)" }
          ], percent(deductedTotal, contractAmount), "израсходовано", "Как израсходован контракт"))
          : ""),
      panel("Контракт проекта", contractForm, contractMsg),
      panel("Ожидают решения",
        ...(pendingExpenses.length
          ? pendingExpenses.map(pendingCard)
          : [h("p", { class: "muted empty" }, "Нет расходов, ожидающих решения.")])),
      panel("Расходы по сотрудникам", breakdown.length
        ? h("div", { class: "split" },
          donut(workerParts, compact(deductedTotal), "сом всего", "Доли расходов по сотрудникам"),
          h("div", { class: "breakdown" }, ...breakdown))
        : h("p", { class: "muted empty" }, "Расходов пока нет.")),
      panel("История пополнений", table(["Дата", "Сотрудник", "Описание", "Подтверждение", "Сумма"], transfers.map(transfer =>
        h("tr", {},
          h("td", {}, date(transfer.created_at)),
          h("td", {}, nameOf(transfer.worker_id)),
          h("td", {}, transfer.note || "—"),
          h("td", {}, proofButton(transfer.proof_path)),
          h("td", { class: "num amount-in" }, "+" + money(Number(transfer.amount))))), "Пополнений пока нет.")),
      panel("История списаний", table(["Дата", "Сотрудник", "Причина", "Подтверждение", "Статус", "Сумма"], expenses.map(expense =>
        h("tr", {},
          h("td", {}, date(expense.created_at)),
          h("td", {}, nameOf(expense.worker_id)),
          h("td", {}, expense.reason),
          h("td", {}, proofButton(expense.proof_path)),
          h("td", {}, statusTag(expense.status), expense.admin_comment ? h("div", { class: "muted" }, expense.admin_comment) : ""),
          h("td", { class: "num" + (expense.status === "rejected" ? " muted" : " amount-out") },
            (expense.status === "rejected" ? "" : "−") + money(Number(expense.amount))))), "Списаний пока нет.")));

    // ----- Add a worker to this project -----
    const addPanel = panel("Добавить сотрудника в проект");
    list.append(addPanel);
    const { data: allWorkers, error: workersError } = await sb.from("profiles")
      .select("id, full_name, role").eq("role", "worker").order("full_name");
    if (workersError) {
      addPanel.append(h("p", { class: "error" }, "Не удалось загрузить список сотрудников: " + workersError.message));
    } else {
      const available = (allWorkers || []).filter(worker => !currentMembers.includes(worker.id));
      if (!available.length) {
        addPanel.append(h("p", { class: "muted empty" }, (allWorkers || []).length
          ? "Все сотрудники уже в этом проекте."
          : "Сотрудников пока нет. Создайте пользователя с ролью worker в Supabase."));
      } else {
        const picker = h("select", { "aria-label": "Сотрудник", required: "" },
          h("option", { value: "" }, "Выберите сотрудника"),
          ...available.map(worker => h("option", { value: worker.id }, worker.full_name || "Без имени")));
        const addError = h("p", { class: "error" });
        const addButton = h("button", { type: "submit" }, "Добавить сотрудника");
        addPanel.append(h("form", {
          class: "row",
          onsubmit: async ev => {
            ev.preventDefault();
            if (!picker.value) { addError.textContent = "Выберите сотрудника"; return; }
            addError.textContent = "";
            addButton.disabled = true;
            const { error: addMemberError } = await sb.from("project_members")
              .insert({ project_id: project.id, user_id: picker.value });
            if (addMemberError) {
              addError.textContent = "Не удалось добавить сотрудника: " + addMemberError.message;
              addButton.disabled = false;
              return;
            }
            await projectView(body, project, back, user);
          }
        }, picker, addButton), addError);
      }
    }

    const workersPanel = panel("Баланс сотрудников");
    list.append(workersPanel);
    if (!currentMembers.length) {
      workersPanel.append(h("p", { class: "muted empty" }, "В проекте пока нет сотрудников."));
      return;
    }
    workersPanel.append(...currentMembers.map(id => {
      const amount = h("input", {
        type: "number",
        min: "0.01",
        step: "0.01",
        placeholder: "Сумма, сом",
        "aria-label": "Сумма для " + nameOf(id),
        required: ""
      });
      const additionNote = h("input", {
        type: "text",
        maxlength: "300",
        placeholder: "Описание пополнения",
        "aria-label": "Описание пополнения для " + nameOf(id),
        required: ""
      });
      const additionError = h("p", { class: "error" });
      const additionSubmit = h("button", { type: "submit" }, "Добавить деньги");
      const additionForm = h("form", {
        class: "transaction-form",
        onsubmit: async ev => {
          ev.preventDefault();
          const value = Number(amount.value);
          const note = additionNote.value.trim();
          if (!Number.isFinite(value) || value <= 0 || !note) {
            additionError.textContent = "Введите сумму больше нуля и описание пополнения";
            return;
          }

          additionError.textContent = "";
          additionSubmit.disabled = true;
          try {
            await insertRow("transfers", {
              project_id: project.id,
              worker_id: id,
              amount: value,
              note,
              created_by: user.id
            });
            await projectView(body, project, back, user);
          } catch (dbError) {
            const code = dbError.code ? " (" + dbError.code + ")" : "";
            additionError.textContent = "Не удалось добавить деньги: " + (dbError.message || "ошибка базы данных") + code;
            additionSubmit.disabled = false;
          }
        }
      }, amount, additionNote, additionSubmit, additionError);

      const deductionAmount = h("input", {
        type: "number",
        min: "0.01",
        step: "0.01",
        placeholder: "Сумма списания, сом",
        "aria-label": "Сумма списания для " + nameOf(id),
        required: ""
      });
      const deductionReason = h("input", {
        type: "text",
        maxlength: "300",
        placeholder: "Причина списания",
        "aria-label": "Причина списания для " + nameOf(id),
        required: ""
      });
      const deductionError = h("p", { class: "error" });
      const deductionSubmit = h("button", { type: "submit" }, "Списать деньги");
      const deductionForm = h("form", {
        class: "transaction-form",
        onsubmit: async ev => {
          ev.preventDefault();
          const value = Number(deductionAmount.value);
          const reason = deductionReason.value.trim();
          if (!Number.isFinite(value) || value <= 0 || !reason) {
            deductionError.textContent = "Введите сумму больше нуля и причину списания";
            return;
          }

          deductionError.textContent = "";
          deductionSubmit.disabled = true;
          try {
            await insertRow("expenses", {
              project_id: project.id,
              worker_id: id,
              amount: value,
              reason,
              status: "approved"
            });
            await projectView(body, project, back, user);
          } catch (dbError) {
            const code = dbError.code ? " (" + dbError.code + ")" : "";
            deductionError.textContent = "Не удалось списать деньги: " + (dbError.message || "ошибка базы данных") + code;
            deductionSubmit.disabled = false;
          }
        }
      }, deductionAmount, deductionReason, deductionSubmit, deductionError);

      return h("div", { class: "worker-balance" },
        h("div", { class: "person-row" },
          avatar(nameOf(id)),
          h("div", { class: "person-text" },
            h("strong", {}, nameOf(id)),
            h("span", { class: "muted" }, "Баланс")),
          h("strong", { class: "person-amount" }, money(balanceOf(id)))),
        h("h3", {}, "Пополнение"),
        additionForm,
        h("h3", {}, "Списание"),
        deductionForm);
    }));
  }

  // ---------- Worker: only my projects ----------
  async function workerProjectView(body, project, user, back) {
    const { data: membership, error: membershipError } = await sb.from("project_members")
      .select("user_id").eq("project_id", project.project_id).eq("user_id", user.id).maybeSingle();
    body.replaceChildren(
      h("div", { class: "page-head" },
        h("button", { type: "button", class: "alt back", onclick: back }, "← Мои проекты"),
        h("h1", {}, project.projects ? project.projects.name : "Проект"))
    );
    if (membershipError || !membership) {
      body.append(h("p", { class: "error" }, "Не удалось проверить доступ к проекту"));
      return;
    }

    const [
      { data: balances, error: balanceError },
      { data: expenses, error: expensesError },
      { data: transfers, error: transfersError }
    ] = await Promise.all([
      sb.from("balances").select("balance")
        .eq("project_id", project.project_id).eq("worker_id", user.id),
      sb.from("expenses").select("amount, reason, proof_path, status, admin_comment, created_at")
        .eq("project_id", project.project_id).eq("worker_id", user.id)
        .order("created_at", { ascending: false }),
      sb.from("transfers").select("amount, note, proof_path, created_at")
        .eq("project_id", project.project_id).eq("worker_id", user.id)
        .order("created_at", { ascending: false })
    ]);

    if (balanceError || expensesError || transfersError) {
      body.append(h("p", { class: "error" }, "Не удалось загрузить баланс и историю операций"));
      return;
    }

    const balance = Number((balances || [])[0]?.balance || 0);
    const money = som;
    const expenseAmount = h("input", {
      type: "number",
      min: "0.01",
      step: "0.01",
      placeholder: "Сумма расхода, сом",
      required: ""
    });
    const expenseReason = h("input", {
      type: "text",
      maxlength: "300",
      placeholder: "Причина расхода",
      required: ""
    });
    const expenseError = h("p", { class: "error" });
    const expenseSubmit = h("button", { type: "submit" }, "Отправить расход");
    const expenseForm = h("form", {
      class: "transaction-form",
      onsubmit: async ev => {
        ev.preventDefault();
        const amount = Number(expenseAmount.value);
        const reason = expenseReason.value.trim();
        if (!Number.isFinite(amount) || amount <= 0 || !reason) {
          expenseError.textContent = "Введите сумму больше нуля и причину расхода";
          return;
        }

        expenseError.textContent = "";
        expenseSubmit.disabled = true;
        try {
          await insertRow("expenses", {
            project_id: project.project_id,
            worker_id: user.id,
            amount,
            reason,
            status: "pending"
          });
          await workerProjectView(body, project, user, back);
        } catch (dbError) {
          const code = dbError.code ? " (" + dbError.code + ")" : "";
          expenseError.textContent = "Не удалось отправить расход: " + (dbError.message || "ошибка базы данных") + code;
          expenseSubmit.disabled = false;
        }
      }
    }, expenseAmount, expenseReason, expenseSubmit, expenseError);
    const expensesTable = h("div", { class: "table-wrap" },
      h("table", {},
        h("thead", {}, h("tr", {},
          h("th", {}, "Дата"),
          h("th", {}, "Причина"),
          h("th", {}, "Сумма"),
          h("th", {}, "Статус"),
          h("th", {}, "Подтверждение"))),
        h("tbody", {}, expenses.length
          ? expenses.map(expense => h("tr", {},
            h("td", {}, new Date(expense.created_at).toLocaleString("ru-RU")),
            h("td", {}, expense.reason),
            h("td", {}, (expense.status === "rejected" ? "" : "−") + money(expense.amount)),
            h("td", {}, statusTag(expense.status), expense.admin_comment ? h("div", { class: "muted" }, "Комментарий: " + expense.admin_comment) : ""),
            h("td", {}, proofButton(expense.proof_path))))
          : [h("tr", {}, h("td", { colspan: "5", class: "muted" }, "Расходов пока нет."))])));
    const transfersTable = h("div", { class: "table-wrap" },
      h("table", {},
        h("thead", {}, h("tr", {},
          h("th", {}, "Дата"),
          h("th", {}, "Описание"),
          h("th", {}, "Сумма"),
          h("th", {}, "Подтверждение"))),
        h("tbody", {}, transfers.length
          ? transfers.map(transfer => h("tr", {},
            h("td", {}, new Date(transfer.created_at).toLocaleString("ru-RU")),
            h("td", {}, transfer.note || "—"),
            h("td", {}, "+" + money(transfer.amount)),
            h("td", {}, proofButton(transfer.proof_path))))
          : [h("tr", {}, h("td", { colspan: "4", class: "muted" }, "Пополнений пока нет."))])));

    // Line: my balance after every top-up and expense (rejected expenses do not count)
    const moves = [
      ...transfers.map(transfer => ({ at: transfer.created_at, change: Number(transfer.amount || 0), note: "Пополнение: " + (transfer.note || "") })),
      ...expenses.filter(expense => expense.status !== "rejected")
        .map(expense => ({ at: expense.created_at, change: -Number(expense.amount || 0), note: "Расход: " + expense.reason }))
    ].sort((a, b) => new Date(a.at) - new Date(b.at));
    let runningBalance = 0;
    const balancePoints = moves.length
      ? [{ t: new Date(moves[0].at).getTime() - 12 * 3600 * 1000, v: 0, note: "До первой операции" }]
      : [];
    moves.forEach(move => {
      runningBalance += move.change;
      balancePoints.push({ t: new Date(move.at).getTime(), v: runningBalance, note: move.note });
    });

    body.append(
      h("div", { class: "stats" },
        stat("Мой баланс", money(balance), "", "accent", "wallet")),
      panel("Мой баланс по дням", balancePoints.length
        ? lineChart(balancePoints, "Мой баланс по дням")
        : h("p", { class: "muted empty" }, "График появится после первой операции.")),
      panel("Отправить расход", expenseForm),
      panel("История расходов", expensesTable),
      panel("История пополнений", transfersTable));
  }

  async function workerView(body, user) {
    const { data, error } = await sb.from("project_members")
      .select("project_id, projects(name)").eq("user_id", user.id);
    const list = h("div", { class: "project-grid" });

    if (error) {
      list.append(h("p", { class: "error" }, "Не удалось загрузить проекты"));
    } else if (!data.length) {
      list.append(h("p", { class: "muted" }, "Вас пока не добавили ни в один проект."));
    } else {
      const { data: balances, error: balancesError } = await sb.from("balances")
        .select("project_id, balance").eq("worker_id", user.id);
      if (balancesError) {
        list.append(h("p", { class: "error" }, "Не удалось загрузить балансы"));
      } else {
        data.forEach(m => {
          const balance = Number((balances || []).find(item => item.project_id === m.project_id)?.balance || 0);
          list.append(h("button", {
            type: "button",
            class: "project-card",
            onclick: () => workerProjectView(body, m, user, () => workerView(body, user))
          },
            h("span", { class: "project-card-head" }, h("strong", {}, m.projects ? m.projects.name : "Проект")),
            h("span", { class: "project-card-label muted" }, "Мой баланс"),
            h("span", { class: "project-card-value" }, som(balance))));
        });
      }
    }

    body.replaceChildren(h("div", { class: "page-head" }, h("h1", {}, "Мои проекты")), list);
  }

  // ---------- Session handling ----------
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
    // setTimeout avoids calling Supabase inside its own auth callback
    setTimeout(() => { session ? renderHome(session.user) : renderLogin(); }, 0);
  });
})();
