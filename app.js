(function () {
  const cfg = window.BEZ_CONFIG || {};
  const root = document.getElementById("app");

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

  const missing = v => !v || v.startsWith("PASTE");
  if (missing(cfg.SUPABASE_URL) || missing(cfg.SUPABASE_KEY)) {
    show(h("div", { class: "card login" },
      h("h1", {}, "Bez"),
      h("p", {}, "Откройте файл config.js и вставьте адрес проекта и ключ Supabase.")));
    return;
  }

  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

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

  // ---------- Home (depends on role) ----------
  async function renderHome(user) {
    show(h("p", { class: "muted" }, "Загрузка…"));
    const { data: profile, error } = await sb.from("profiles")
      .select("full_name, role").eq("id", user.id).single();
    const logout = h("button", { class: "alt", onclick: () => sb.auth.signOut() }, "Выйти");
    if (error || !profile) {
      show(h("div", { class: "card" },
        h("p", { class: "error" }, "Не удалось загрузить профиль."), logout));
      return;
    }
    const isAdmin = profile.role === "admin";
    const top = h("header", { class: "top" },
      h("div", {},
        h("strong", {}, profile.full_name || user.email),
        h("div", { class: "muted" }, isAdmin ? "Администратор" : "Сотрудник")),
      logout);
    const body = h("div", {});
    show(top, body);
    if (isAdmin) await adminView(body, user); else await workerView(body, user);
  }

  // ---------- Admin: all projects + create ----------
  async function adminView(body, user) {
    const list = h("div", { class: "list" });
    const msg = h("p", { class: "error" });
    const name = h("input", { type: "text", placeholder: "Название проекта", maxlength: "80", required: "" });
    const form = h("form", {
      class: "row",
      onsubmit: async ev => {
        ev.preventDefault();
        const n = name.value.trim();
        if (!n) return;
        msg.textContent = "";
        const { error } = await sb.from("projects").insert({ name: n, created_by: user.id });
        if (error) { msg.textContent = "Не удалось создать проект"; return; }
        name.value = "";
        await load();
      }
    }, name, h("button", { type: "submit" }, "Создать"));

    async function load() {
      const { data, error } = await sb.from("projects")
        .select("id, name, created_at").order("created_at", { ascending: false });
      list.replaceChildren();
      if (error) { list.append(h("p", { class: "error" }, "Не удалось загрузить проекты")); return; }
      if (!data.length) { list.append(h("p", { class: "muted" }, "Проектов пока нет. Создайте первый.")); return; }
                  data.forEach(p => list.append(h("div", { class: "item", style: "cursor:pointer", onclick: () => projectView(body, p, () => renderHome(user)) },
        h("span", {}, p.name),
        h("span", { class: "muted" }, new Date(p.created_at).toLocaleDateString("ru-RU")))));
    }

    body.append(h("h2", {}, "Проекты"), form, msg, list);
    await load();
  }
  // ---------- Admin: one project page ----------
  async function projectView(body, project, back) {
    const list = h("div", { class: "list" }, h("p", { class: "muted" }, "Загрузка…"));
    body.replaceChildren(
      h("button", { class: "alt", onclick: back }, "← Назад"),
      h("h2", {}, project.name),
      list);
    const { data: members, error } = await sb.from("project_members")
      .select("user_id").eq("project_id", project.id);
    if (error) { list.replaceChildren(h("p", { class: "error" }, "Не удалось загрузить сотрудников")); return; }
    if (!members.length) { list.replaceChildren(h("p", { class: "muted" }, "В проекте пока нет сотрудников.")); return; }
    const ids = members.map(m => m.user_id);
    const { data: people } = await sb.from("profiles").select("id, full_name").in("id", ids);
    const { data: bals } = await sb.from("balances").select("worker_id, balance").eq("project_id", project.id);
    const nameOf = id => ((people || []).find(p => p.id === id) || {}).full_name || "Без имени";
    const balOf = id => Number(((bals || []).find(b => b.worker_id === id) || {}).balance || 0);
    list.replaceChildren(...ids.map(id => h("div", { class: "item" },
      h("span", {}, nameOf(id)),
      h("strong", {}, balOf(id).toLocaleString("ru-RU") + " сом"))));
  }
  // ---------- Worker: only my projects ----------
  async function workerView(body, user) {
    const { data, error } = await sb.from("project_members")
      .select("project_id, projects(name)").eq("user_id", user.id);
    const list = h("div", { class: "list" });
    if (error) list.append(h("p", { class: "error" }, "Не удалось загрузить проекты"));
    else if (!data.length) list.append(h("p", { class: "muted" }, "Вас пока не добавили ни в один проект."));
    else data.forEach(m => list.append(h("div", { class: "item" },
      h("span", {}, m.projects ? m.projects.name : "Проект"))));
    body.append(h("h2", {}, "Мои проекты"), list);
  }

  // ---------- Session handling ----------
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
    // setTimeout avoids calling Supabase inside its own auth callback
    setTimeout(() => { session ? renderHome(session.user) : renderLogin(); }, 0);
  });
})();
