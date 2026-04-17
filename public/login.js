async function fetchJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function fetchJsonGet(url) {
  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function setHint(text, isError = false) {
  const el = document.getElementById("loginHint");
  if (!el) return;
  el.textContent = String(text || "");
  el.style.color = isError ? "#dc2626" : "#6b7280";
}

async function checkAlreadyAuthed() {
  try {
    const r = await fetchJsonGet("/api/auth/me");
    if (r?.ok) window.location.href = "/";
  } catch {}
}

function initLogin() {
  const userEl = document.getElementById("loginUser");
  const passEl = document.getElementById("loginPass");
  const btn = document.getElementById("loginBtn");
  if (!(userEl instanceof HTMLInputElement) || !(passEl instanceof HTMLInputElement) || !(btn instanceof HTMLButtonElement))
    return;

  const doLogin = async () => {
    const username = String(userEl.value || "").trim();
    const password = String(passEl.value || "");
    if (!username || !password) {
      setHint("请输入账号和密码", true);
      return;
    }
    try {
      btn.disabled = true;
      setHint("登录中...");
      await fetchJson("/api/auth/login", { username, password });
      window.location.href = "/";
    } catch (e) {
      setHint(`登录失败：${String(e?.message || e || "")}`, true);
    } finally {
      btn.disabled = false;
    }
  };

  btn.addEventListener("click", doLogin);
  passEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") doLogin();
  });
  userEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") doLogin();
  });

  try {
    userEl.focus();
  } catch {}
}

checkAlreadyAuthed();
initLogin();

