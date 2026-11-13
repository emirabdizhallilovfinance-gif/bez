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
  const maxProofSize = 10 * 1024 * 1024;
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
  function stat(label, value, extra, tone) {
    return h("div", { class: "stat" + (tone ? " stat-" + tone : "") },
      h("span", { class: "stat-label" }, label),
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

  function proofFileInput(label) {
    return h("input", {
      class: "proof-file",
      type: "file",
      accept: ".png,.jpg,.jpeg,image/png,image/jpeg",
      "aria-label": label,
      required: ""
    });
  }

  async function uploadProof(file, workerId, projectId) {
    if (!file) throw new Error("Выберите скриншот или фото-подтверждение");
    if (file.size > maxProofSize) throw new Error("Размер файла не должен превышать 10 МБ");

    const extension = (file.name.split(".").pop() || "").toLowerCase();
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const isPng = extension === "png" && bytes.length === 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const isJpeg = (extension === "jpg" || extension === "jpeg")
      && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isPng && !isJpeg) throw new Error("Разрешены только файлы PNG, JPG и JPEG");
    if (file.type && file.type !== (isPng ? "image/png" : "image/jpeg")) {
      throw new Error("Тип файла не соответствует его содержимому");
    }

    const path = workerId + "/" + projectId + "/" + crypto.randomUUID() + "." + extension;
    const { error } = await sb.storage.from("proofs").upload(path, file, {
      contentType: isPng ? "image/png" : "image/jpeg",
      upsert: false
    });
    if (error) throw error;
    return path;
  }

  async function insertWithProof(table, values, file, workerId, projectId) {
    const path = await uploadProof(file, workerId, projectId);
    const { error } = await sb.from(table).insert({ ...values, proof_path: path });
    if (!error) return;

    const { error: cleanupError } = await sb.storage.from("proofs").remove([path]);
    if (cleanupError) {
      throw new Error(error.message + "; не удалось удалить незарегистрированный файл: " + cleanupError.message);
    }
    throw error;
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
    const displayName = profile.full_name || user.email;
    logout.className = "alt logout";
    const sidebar = h("aside", { class: "sidebar" },
      h("div", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }, "B"), "Bez"),
      h("nav", { class: "nav", "aria-label": "Разделы" },
        h("button", { type: "button", class: "nav-item active", onclick: () => renderHome(user) },
          isAdmin ? "Проекты" : "Мои проекты")),
      h("div", { class: "sidebar-user" },
        avatar(displayName),
        h("div", { class: "sidebar-user-text" },
          h("strong", {}, displayName),
          h("span", { class: "muted" }, isAdmin ? "Администратор" : "Сотрудник")),
        logout));
    const body = h("div", { class: "content" });
    show(h("div", { class: "shell" }, sidebar, h("main", { class: "main" }, body)));
    if (isAdmin) await adminView(body, user); else await workerView(body, user);
  }

  // ---------- Admin: all projects + create ----------
  async function adminView(body, user) {
    const grid = h("div", { class: "project-grid" }, h("p", { class: "muted" }, "Загрузка…"));
    const summary = h("div", { class: "stats" });
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

    async function load() {
      const [
        { data: projects, error },
        { data: contracts, error: contractsError },
        { data: expenses, error: expensesError }
      ] = await Promise.all([
        sb.from("projects").select("id, name, created_at").order("created_at", { ascending: false }),
        sb.from("project_contracts").select("project_id, amount"),
        fetchAll("expenses", "id, project_id, amount, status")
      ]);
      grid.replaceChildren();
      summary.replaceChildren();
      if (error) { grid.append(h("p", { class: "error" }, "Не удалось загрузить проекты")); return; }
      if (!projects.length) { grid.append(h("p", { class: "muted" }, "Проектов пока нет. Создайте первый.")); return; }

      const missingTable = contractTableMissing(contractsError);
      const spentBy = {};
      (expensesError ? [] : expenses)
        .filter(expense => expense.status !== "rejected")
        .forEach(expense => { spentBy[expense.project_id] = (spentBy[expense.project_id] || 0) + Number(expense.amount || 0); });
      const contractOf = id => (contracts || []).find(item => item.project_id === id);

      const contractTotal = (contracts || []).reduce((total, item) => total + Number(item.amount || 0), 0);
      const spentOnContracts = (contracts || []).reduce((total, item) => total + (spentBy[item.project_id] || 0), 0);
      summary.append(
        stat("Проектов", String(projects.length)),
        stat("Сумма контрактов", contractsError ? "—" : som(contractTotal)),
        stat("Остаток по контрактам", contractsError ? "—" : som(contractTotal - spentOnContracts),
          contractsError ? "" : meter(spentOnContracts, contractTotal), "accent"));
      if (missingTable) {
        grid.append(h("p", { class: "notice" }, "Контракты пока недоступны: выполните project-contract.sql в Supabase SQL Editor."));
      } else if (contractsError) {
        grid.append(h("p", { class: "error" }, "Не удалось загрузить контракты: " + contractsError.message));
      }
      if (expensesError) grid.append(h("p", { class: "error" }, "Не удалось загрузить расходы для подсчёта остатка"));

      projects.forEach(p => {
        const item = contractOf(p.id);
        const spent = spentBy[p.id] || 0;
        const total = item ? Number(item.amount || 0) : 0;
        grid.append(h("button", {
          type: "button",
          class: "project-card",
          onclick: () => projectView(body, p, () => renderHome(user), user)
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
            ]));
      });
    }

    body.append(
      h("div", { class: "page-head" }, h("h1", {}, "Проекты")),
      summary,
      panel("Новый проект", form, msg),
      grid);
    await load();
  }

  // ---------- Admin: one project page ----------
  async function projectView(body, project, back, user) {
    const list = h("div", { class: "project-layout" }, h("p", { class: "muted" }, "Загрузка…"));
    body.replaceChildren(
      h("div", { class: "page-head" },
        h("button", { type: "button", class: "alt back", onclick: back }, "← Все проекты"),
        h("h1", {}, project.name)),
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

    function pendingCard(expense) {
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
        await projectView(body, project, back, user);
      }

      return h("div", { class: "pending-item" },
        h("div", { class: "person-row" },
          avatar(nameOf(expense.worker_id)),
          h("div", { class: "person-text" },
            h("strong", {}, nameOf(expense.worker_id)),
            h("span", { class: "muted" }, expense.reason + " · " + date(expense.created_at))),
          h("strong", { class: "amount-out" }, "−" + money(Number(expense.amount)))),
        proofButton(expense.proof_path),
        comment,
        h("div", { class: "row" }, approve, reject),
        error);
    }

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

    const pendingExpenses = expenses.filter(expense => expense.status === "pending");
    list.replaceChildren(
      h("div", { class: "stats" },
        contractStat,
        stat("Расходы сотрудников", money(deductedTotal),
          pendingTotal ? h("span", { class: "stat-note" }, "из них ждут решения: " + money(pendingTotal)) : ""),
        stat("Выдано сотрудникам", money(addedTotal)),
        stat("На руках у сотрудников", money(addedTotal - deductedTotal))),
      h("p", { class: "hint" }, "Остаток контракта видит только администратор. Расходы в ожидании уже вычтены; отклонённые возвращаются в остаток."),
      panel("Контракт проекта", contractForm, contractMsg),
      panel("Ожидают решения",
        ...(pendingExpenses.length
          ? pendingExpenses.map(pendingCard)
          : [h("p", { class: "muted empty" }, "Нет расходов, ожидающих решения.")])),
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
      const additionProof = proofFileInput("Подтверждение пополнения для " + nameOf(id));
      const additionError = h("p", { class: "error" });
      const additionSubmit = h("button", { type: "submit" }, "Добавить деньги");
      const additionForm = h("form", {
        class: "transaction-form",
        onsubmit: async ev => {
          ev.preventDefault();
          const value = Number(amount.value);
          if (!Number.isFinite(value) || value <= 0) {
            additionError.textContent = "Введите сумму больше нуля";
            return;
          }

          additionError.textContent = "";
          additionSubmit.disabled = true;
          try {
            await insertWithProof("transfers", {
              project_id: project.id,
              worker_id: id,
              amount: value,
              note: "Пополнение баланса",
              created_by: user.id
            }, additionProof.files[0], id, project.id);
            await projectView(body, project, back, user);
          } catch (dbError) {
            const code = dbError.code ? " (" + dbError.code + ")" : "";
            additionError.textContent = "Не удалось добавить деньги: " + (dbError.message || "ошибка базы данных") + code;
            additionSubmit.disabled = false;
          }
        }
      }, amount, additionProof, additionSubmit, additionError);

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
      const deductionProof = proofFileInput("Подтверждение списания для " + nameOf(id));
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
            await insertWithProof("expenses", {
              project_id: project.id,
              worker_id: id,
              amount: value,
              reason,
              status: "approved"
            }, deductionProof.files[0], id, project.id);
            await projectView(body, project, back, user);
          } catch (dbError) {
            const code = dbError.code ? " (" + dbError.code + ")" : "";
            deductionError.textContent = "Не удалось списать деньги: " + (dbError.message || "ошибка базы данных") + code;
            deductionSubmit.disabled = false;
          }
        }
      }, deductionAmount, deductionReason, deductionProof, deductionSubmit, deductionError);

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
    const expenseProof = proofFileInput("Скриншот или фото-подтверждение расхода");
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
          await insertWithProof("expenses", {
            project_id: project.project_id,
            worker_id: user.id,
            amount,
            reason,
            status: "pending"
          }, expenseProof.files[0], user.id, project.project_id);
          await workerProjectView(body, project, user, back);
        } catch (dbError) {
          const code = dbError.code ? " (" + dbError.code + ")" : "";
          expenseError.textContent = "Не удалось отправить расход: " + (dbError.message || "ошибка базы данных") + code;
          expenseSubmit.disabled = false;
        }
      }
    }, expenseAmount, expenseReason, expenseProof, expenseSubmit, expenseError);
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

    body.append(
      h("div", { class: "stats" },
        stat("Мой баланс", money(balance), "", "accent")),
      panel("Отправить расход с подтверждением", expenseForm),
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
