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
      data.forEach(p => list.append(h("div", { class: "item", style: "cursor:pointer", onclick: () => projectView(body, p, () => renderHome(user), user) },
        h("span", {}, p.name),
        h("span", { class: "muted" }, new Date(p.created_at).toLocaleDateString("ru-RU")))));
    }

    body.append(h("h2", {}, "Проекты"), form, msg, list);
    await load();
  }
  // ---------- Admin: one project page ----------
  async function projectView(body, project, back, user) {
    const list = h("div", { class: "list" }, h("p", { class: "muted" }, "Загрузка…"));
    body.replaceChildren(
      h("button", { class: "alt", onclick: back }, "← Назад"),
      h("h2", {}, project.name),
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
      { data: balances, error: balancesError }
    ] = await Promise.all([
      sb.from("project_members").select("user_id").eq("project_id", project.id),
      loadAllRows("transfers", "worker_id, amount, note, proof_path, created_at"),
      loadAllRows("expenses", "id, worker_id, amount, reason, proof_path, status, admin_comment, created_at"),
      sb.from("balances").select("worker_id, balance").eq("project_id", project.id)
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
    const money = value => value.toLocaleString("ru-RU") + " сом";
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

      return h("div", { class: "worker-balance" },
        h("div", { class: "worker-balance-heading" },
          h("span", {}, nameOf(expense.worker_id) + " · " + expense.reason),
          h("strong", {}, "−" + money(Number(expense.amount)))),
        h("div", { class: "muted" }, date(expense.created_at)),
        proofButton(expense.proof_path),
        comment,
        h("div", { class: "row" }, approve, reject),
        error);
    }

    const pendingExpenses = expenses.filter(expense => expense.status === "pending");
    list.replaceChildren(
      h("h2", {}, "Ожидают решения"),
      ...(pendingExpenses.length
        ? pendingExpenses.map(pendingCard)
        : [h("p", { class: "muted" }, "Нет расходов, ожидающих решения.")]),
      h("div", { class: "transaction-totals" },
        h("div", { class: "transaction-total" }, h("span", { class: "muted" }, "Всего добавлено"), h("strong", {}, money(addedTotal))),
        h("div", { class: "transaction-total" }, h("span", { class: "muted" }, "Всего списано"), h("strong", {}, money(deductedTotal))),
        h("div", { class: "transaction-total" }, h("span", { class: "muted" }, "Итого"), h("strong", {}, money(addedTotal - deductedTotal)))),
      h("h2", {}, "История пополнений"),
      table(["Дата", "Сотрудник", "Описание", "Подтверждение", "Сумма"], transfers.map(transfer =>
        h("tr", {},
          h("td", {}, date(transfer.created_at)),
          h("td", {}, nameOf(transfer.worker_id)),
          h("td", {}, transfer.note || "—"),
          h("td", {}, proofButton(transfer.proof_path)),
          h("td", {}, "+" + money(Number(transfer.amount))))), "Пополнений пока нет."),
      h("h2", {}, "История списаний"),
      table(["Дата", "Сотрудник", "Причина", "Подтверждение", "Статус", "Сумма"], expenses.map(expense =>
        h("tr", {},
          h("td", {}, date(expense.created_at)),
          h("td", {}, nameOf(expense.worker_id)),
          h("td", {}, expense.reason),
          h("td", {}, proofButton(expense.proof_path)),
          h("td", {}, statusText(expense.status), expense.admin_comment ? h("div", { class: "muted" }, expense.admin_comment) : ""),
          h("td", {}, (expense.status === "rejected" ? "" : "−") + money(Number(expense.amount))))), "Списаний пока нет."));

    list.append(h("h2", {}, "Баланс сотрудников"));
    if (!currentMembers.length) {
      list.append(h("p", { class: "muted" }, "В проекте пока нет сотрудников."));
      return;
    }
    list.append(...currentMembers.map(id => {
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
        h("div", { class: "worker-balance-heading" },
          h("span", {}, nameOf(id)),
          h("strong", {}, money(balanceOf(id)))),
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
      h("button", { class: "alt", onclick: back }, "← Назад"),
      h("h2", {}, project.projects ? project.projects.name : "Проект")
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
    const money = value => Number(value || 0).toLocaleString("ru-RU") + " сом";
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
            h("td", {}, statusText(expense.status), expense.admin_comment ? h("div", { class: "muted" }, "Комментарий: " + expense.admin_comment) : ""),
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
      h("div", { class: "item" },
        h("span", {}, "Мой баланс"),
        h("strong", {}, money(balance))),
      h("h2", {}, "История пополнений"),
      transfersTable,
      h("h2", {}, "Отправить расход с подтверждением"),
      expenseForm,
      h("h2", {}, "История расходов"),
      expensesTable);
  }

  async function workerView(body, user) {
    const { data, error } = await sb.from("project_members")
      .select("project_id, projects(name)").eq("user_id", user.id);
    const list = h("div", { class: "list" });

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
          list.append(h("div", {
            class: "item",
            onclick: () => workerProjectView(body, m, user, () => workerView(body, user))
          },
            h("span", {}, m.projects ? m.projects.name : "Проект"),
            h("strong", {}, balance.toLocaleString("ru-RU") + " сом")));
        });
      }
    }

    body.replaceChildren(h("h2", {}, "Мои проекты"), list);
  }

  // ---------- Session handling ----------
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
    // setTimeout avoids calling Supabase inside its own auth callback
    setTimeout(() => { session ? renderHome(session.user) : renderLogin(); }, 0);
  });
})();
