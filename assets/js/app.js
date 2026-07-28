import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/+esm";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./supabase-config.js";

const APP_VERSION = "1.7.0";
const STORAGE_PREFIX = "besPortalState_v1_7_0";
const MAX_BACKUP_BYTES = 1_000_000;
const CONFIG_READY =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("__SUPABASE_");

const supabase = CONFIG_READY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      db: {
        schema: "api",
      },
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

const DEFAULT_TASKS = [
  {
    id: "inbound",
    title: "Validar recibos y ubicaciones de Inbound",
    area: "Inbound",
    priority: "Alta",
    time: "09:30",
    done: false,
  },
  {
    id: "inventory",
    title: "Ejecutar conteo cíclico y conciliar diferencias",
    area: "Inventarios",
    priority: "Alta",
    time: "11:00",
    done: false,
  },
  {
    id: "outbound",
    title: "Confirmar surtido y liberación de Outbound",
    area: "Outbound",
    priority: "Alta",
    time: "13:00",
    done: false,
  },
  {
    id: "racks",
    title: "Revisar movimientos pendientes en BL RACKS",
    area: "BL RACKS",
    priority: "Media",
    time: "15:00",
    done: false,
  },
  {
    id: "control",
    title: "Entregar evidencias a Mesa de Control",
    area: "Mesa de Control",
    priority: "Media",
    time: "16:30",
    done: false,
  },
  {
    id: "closing",
    title: "Completar cierre diario en SIGO-BL",
    area: "SIGO-BL",
    priority: "Alta",
    time: "18:00",
    done: false,
  },
];

const DEFAULT_LINKS = { SIGO_BL: "", BLOS: "", BL_RACKS: "", Odoo: "" };
const LINK_LABELS = {
  SIGO_BL: "SIGO-BL",
  BLOS: "BLOS",
  BL_RACKS: "BL RACKS",
  Odoo: "Odoo",
};
const TITLES = {
  dashboard: "Resumen operativo",
  mastermap: "Mapa Maestro BES",
  governance: "Gobierno BES",
  tasks: "Agenda operativa",
  warehouse: "Almacenes BL1–BL5",
  documents: "Biblioteca documental",
  audit: "Auditoría",
  settings: "Configuración",
};
const MODULES = [
  "Gobierno BES",
  "BLOS Methodology",
  "SIGO-BL",
  "Operación Integral",
  "Odoo Enterprise",
  "BL RACKS",
  "Integración Odoo ↔ BL RACKS",
  "Business Intelligence",
  "Calidad y Auditoría",
  "Mejora Continua",
  "Universidad Best Linen",
  "Gestión del Talento",
  "Control Documental",
  "Dirección General",
];
const MODULE_RECOVERY = {
  11: {
    status: "Expediente listo",
    detail:
      "Nueve perfiles, solicitudes, RACI/KPI y roadmap 30/60/90 preparados para autorización, con actividades y controles detallados.",
  },
  13: {
    status: "Contenido avanzado",
    detail:
      "Presentación ejecutiva de 13 diapositivas validada visualmente; aprobación de Dirección General pendiente.",
  },
};
const GOVERNANCE_DOCS = [
  "Manual de Gobierno BES",
  "Constitución BES",
  "Arquitectura Empresarial",
  "BES CORE",
  "Manual de Identidad Documental",
  "Sistema de Codificación",
  "Política de Control Documental",
  "Roadmap Estratégico",
  "Matriz RACI",
  "Índice Maestro",
  "Glosario",
  "Presentación Ejecutiva",
  "Plantilla Word",
  "Plantilla PowerPoint",
  "Plantilla Excel",
];
const SECTIONS = [
  "00. Gobierno",
  "01. Manuales",
  "02. SOP",
  "03. PRO",
  "04. FOR",
  "05. WI",
  "06. POL",
  "07. STD",
  "08. CAP",
  "09. PPT",
  "10. A3",
  "11. KPI",
  "12. Dashboard",
  "13. Auditorías",
  "14. Riesgos",
  "15. Mejora Continua",
  "16. Diagramas",
  "17. Formatos Especiales",
  "18. Evidencias",
  "19. Plantillas",
  "20. Historial de Versiones",
  "21. README",
];
const GOV_STATUS = {
  pending: { label: "Pendiente", weight: 0 },
  draft: { label: "Borrador", weight: 0.35 },
  review: { label: "En revisión", weight: 0.7 },
  approved: { label: "Aprobado", weight: 1 },
};
const GOV_FLOW = ["pending", "draft", "review", "approved"];
const PRIVILEGED_ROLES = new Set([
  "owner",
  "admin",
  "platform_admin",
  "architect",
]);

let state = null;
let currentUser = null;
let accessContext = null;
let activeAccess = null;
let taskFilter = "all";
let authEvaluation = 0;
let enrollmentFactorId = null;
let challengeFactorId = null;

function select(selector) {
  return document.querySelector(selector);
}

function selectAll(selector) {
  return document.querySelectorAll(selector);
}

function defaultGovernance() {
  return Object.fromEntries(GOVERNANCE_DOCS.map((_, index) => [index, "pending"]));
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function profileFromContext(context, membership) {
  const profile = context?.profile ?? {};
  const name =
    profile.preferred_name ||
    profile.full_name ||
    currentUser?.email?.split("@")[0] ||
    "Usuario BES";
  return {
    name,
    role: roleLabel(membership),
  };
}

function createDefaultState(profile) {
  return {
    version: APP_VERSION,
    profile,
    tasks: structuredClone(DEFAULT_TASKS),
    links: { ...DEFAULT_LINKS },
    governance: defaultGovernance(),
    audit: [],
    theme: "light",
  };
}

function loadState(userId, profile) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(userId)));
    if (validStateShape(saved)) {
      return {
        ...saved,
        version: APP_VERSION,
        profile,
        links: normalizeLinks(saved.links),
        governance: normalizeGovernance(saved.governance),
        audit: normalizeAudit(saved.audit, profile.name),
      };
    }
  } catch {
    // A damaged device-local record is isolated to this user and replaced.
  }
  return createDefaultState(profile);
}

function persist() {
  if (!currentUser?.id || !state) return;
  localStorage.setItem(storageKey(currentUser.id), JSON.stringify(state));
}

function logEvent(event) {
  if (!state) return;
  state.audit.unshift({
    at: new Date().toISOString(),
    user: state.profile.name,
    event,
  });
  state.audit = state.audit.slice(0, 100);
  persist();
  renderAudit();
}

function toast(message) {
  const element = select("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function isAllowedPortalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function normalizeLinks(links) {
  return Object.fromEntries(
    Object.keys(DEFAULT_LINKS).map((key) => {
      const value = typeof links?.[key] === "string" ? links[key].trim() : "";
      return [key, isAllowedPortalUrl(value) ? value : ""];
    }),
  );
}

function normalizeGovernance(governance) {
  return Object.fromEntries(
    GOVERNANCE_DOCS.map((_, index) => {
      const status = governance?.[index];
      return [index, GOV_FLOW.includes(status) ? status : "pending"];
    }),
  );
}

function normalizeAudit(entries, fallbackUser) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const at = new Date(entry.at);
    if (Number.isNaN(at.getTime())) return [];
    return [
      {
        at: at.toISOString(),
        user: String(entry.user ?? fallbackUser).slice(0, 120),
        event: String(entry.event ?? "").slice(0, 300),
      },
    ];
  });
}

function validStateShape(value) {
  return (
    value &&
    Array.isArray(value.tasks) &&
    value.tasks.every(
      (task) =>
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        typeof task.done === "boolean",
    ) &&
    value.links &&
    typeof value.links === "object"
  );
}

function taskHTML(task) {
  return `<article class="task ${task.done ? "done" : ""}" data-id="${escapeHTML(task.id)}">
    <button class="check" aria-label="${task.done ? "Marcar pendiente" : "Marcar concluida"}">${task.done ? "✓" : ""}</button>
    <div>
      <div class="task-title">${escapeHTML(task.title)}</div>
      <div class="task-meta">
        <span class="tag">${escapeHTML(task.area)}</span>
        <span class="priority">Prioridad ${escapeHTML(task.priority)}</span>
      </div>
    </div>
    <time>${escapeHTML(task.time)}</time>
  </article>`;
}

function renderTasks() {
  const done = state.tasks.filter((task) => task.done).length;
  const total = state.tasks.length;
  const percentage = total ? Math.round((done / total) * 100) : 0;
  select("#doneStat").textContent = `${done}/${total}`;
  select("#percentStat").textContent = `${percentage}% del plan diario`;
  select("#progressBar").style.width = `${percentage}%`;
  select("#welcomeCopy").textContent =
    done === total
      ? "Plan diario concluido. Excelente cierre."
      : `Tienes ${total - done} ${total - done === 1 ? "tarea pendiente" : "tareas pendientes"} para completar hoy.`;
  select("#taskListDashboard").innerHTML = state.tasks
    .slice(0, 4)
    .map(taskHTML)
    .join("");
  const filtered = state.tasks.filter(
    (task) =>
      taskFilter === "all" ||
      (taskFilter === "done" && task.done) ||
      (taskFilter === "pending" && !task.done),
  );
  select("#taskListFull").innerHTML = filtered.length
    ? filtered.map(taskHTML).join("")
    : '<div class="empty">No hay tareas en esta vista.</div>';
  selectAll(".task .check").forEach((button) => {
    button.onclick = () => toggleTask(button.closest(".task").dataset.id);
  });
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.done = !task.done;
  persist();
  logEvent(`${task.done ? "Concluyó" : "Reabrió"}: ${task.title}`);
  renderTasks();
  toast(task.done ? "Tarea concluida" : "Tarea reabierta");
}

function renderLinks() {
  select("#quickLinks").innerHTML = Object.entries(LINK_LABELS)
    .map(([key, label]) => {
      const url = state.links[key];
      return `<a class="quick" href="${url ? escapeHTML(url) : "#"}" data-system="${key}" ${url ? 'target="_blank" rel="noopener noreferrer"' : ""}>
        <b>${label}</b>
        <small>${url ? "Abrir sistema" : "Configurar enlace"}</small>
      </a>`;
    })
    .join("");
  select("#linkFields").innerHTML = Object.entries(LINK_LABELS)
    .map(
      ([key, label]) =>
        `<div class="field">
          <label for="link_${key}">${label}</label>
          <input id="link_${key}" type="url" inputmode="url" placeholder="https://…" value="${escapeHTML(state.links[key] || "")}">
        </div>`,
    )
    .join("");
  selectAll(".quick").forEach((anchor) => {
    anchor.onclick = (event) => {
      if (!state.links[anchor.dataset.system]) {
        event.preventDefault();
        showPage("settings");
        toast("Configura primero este enlace");
      }
    };
  });
}

function saveLinks() {
  const candidate = Object.fromEntries(
    Object.keys(DEFAULT_LINKS).map((key) => [
      key,
      select(`#link_${key}`).value.trim(),
    ]),
  );
  const invalid = Object.entries(candidate).find(
    ([, value]) => !isAllowedPortalUrl(value),
  );
  if (invalid) {
    select(`#link_${invalid[0]}`).focus();
    toast("Usa HTTPS; HTTP solo se permite en localhost para pruebas");
    return;
  }
  state.links = candidate;
  persist();
  logEvent("Actualizó enlaces de sistemas");
  renderLinks();
  toast("Enlaces guardados");
}

function renderAudit() {
  const rows = select("#auditRows");
  const empty = select("#auditEmpty");
  rows.innerHTML = state.audit
    .map(
      (entry) =>
        `<tr><td>${new Date(entry.at).toLocaleString("es-MX")}</td><td>${escapeHTML(entry.user)}</td><td>${escapeHTML(entry.event)}</td></tr>`,
    )
    .join("");
  empty.classList.toggle("hidden", state.audit.length > 0);
}

function showPage(id) {
  if (
    !state ||
    !currentUser ||
    select("#appView").classList.contains("hidden")
  ) {
    return;
  }
  if (!Object.hasOwn(TITLES, id)) return;
  selectAll(".page").forEach((page) =>
    page.classList.toggle("active", page.id === id),
  );
  selectAll(".nav button").forEach((button) =>
    button.classList.toggle("active", button.dataset.page === id),
  );
  select("#pageTitle").textContent = TITLES[id];
  select("#sidebar").classList.remove("open");
  window.scrollTo(0, 0);
}

function exportData() {
  const payload = {
    version: state.version,
    tasks: state.tasks,
    links: state.links,
    governance: state.governance,
    audit: state.audit,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bes-access-portal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  logEvent("Exportó un respaldo JSON");
  toast("Respaldo exportado");
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES) {
      throw new Error("El archivo supera el límite de 1 MB");
    }
    const imported = JSON.parse(await file.text());
    if (!validStateShape(imported)) {
      throw new Error("Estructura no compatible");
    }
    const normalizedLinks = normalizeLinks(imported.links);
    const hasRejectedLink = Object.keys(DEFAULT_LINKS).some(
      (key) =>
        String(imported.links?.[key] ?? "").trim() &&
        !normalizedLinks[key],
    );
    if (hasRejectedLink) {
      throw new Error("El respaldo contiene un enlace no permitido");
    }
    state = {
      ...state,
      version: APP_VERSION,
      tasks: imported.tasks.map((task) => ({
        id: String(task.id).slice(0, 80),
        title: String(task.title).slice(0, 240),
        area: String(task.area ?? "").slice(0, 100),
        priority: String(task.priority ?? "").slice(0, 40),
        time: String(task.time ?? "").slice(0, 20),
        done: Boolean(task.done),
      })),
      links: normalizedLinks,
      governance: normalizeGovernance(imported.governance),
      audit: normalizeAudit(imported.audit, state.profile.name),
    };
    persist();
    logEvent(`Importó respaldo: ${file.name}`);
    renderAll();
    toast("Respaldo importado");
  } catch (error) {
    toast(`No se pudo importar: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function cycleGovernance(index) {
  const current = state.governance[index] || "pending";
  const next = GOV_FLOW[(GOV_FLOW.indexOf(current) + 1) % GOV_FLOW.length];
  state.governance[index] = next;
  persist();
  logEvent(
    `Gobierno BES: ${GOVERNANCE_DOCS[index]} → ${GOV_STATUS[next].label}`,
  );
  renderArchitecture();
  toast(`Estado: ${GOV_STATUS[next].label}`);
}

function renderArchitecture() {
  select("#moduleGrid").innerHTML = MODULES.map((name, index) => {
    const recovered = MODULE_RECOVERY[index];
    const status =
      index === 0 ? "En construcción" : recovered?.status || "Pendiente";
    const detail =
      index === 0
        ? "Define las reglas, arquitectura, autoridad y control de BES."
        : recovered?.detail ||
          "Pendiente de Mapa del Pilar, gobierno y desarrollo documental.";
    const destination = index === 0 ? "governance" : "documents";
    const button =
      index === 0 || recovered
        ? `<button class="btn secondary" data-module-go="${destination}">${index === 0 ? "Abrir módulo" : "Ver evidencia"}</button>`
        : "";
    return `<article class="card module-card ${index === 0 ? "building" : "pending"}">
      <span class="module-code">Módulo ${String(index).padStart(2, "0")}</span>
      <h3>${name}</h3>
      <p>${detail}</p>
      <div class="module-state">
        <span class="state-pill ${index === 0 ? "building" : ""}">${status}</span>
        <span class="release-no">No liberado</span>
      </div>
      ${button}
    </article>`;
  }).join("");
  selectAll("[data-module-go]").forEach((button) => {
    button.onclick = () => showPage(button.dataset.moduleGo);
  });

  const statuses = GOVERNANCE_DOCS.map(
    (_, index) => state.governance[index] || "pending",
  );
  const approved = statuses.filter((status) => status === "approved").length;
  const progress = Math.round(
    (statuses.reduce((sum, status) => sum + GOV_STATUS[status].weight, 0) /
      GOVERNANCE_DOCS.length) *
      100,
  );
  const gate =
    progress < 20
      ? "G0"
      : progress < 40
        ? "G1"
        : progress < 70
          ? "G2"
          : progress < 90
            ? "G3"
            : "G4";
  select("#govProgress").textContent = `${progress}%`;
  select("#govProgressBar").style.width = `${progress}%`;
  select("#govApproved").textContent = `${approved}/${GOVERNANCE_DOCS.length}`;
  select("#govGate").textContent = gate;
  select("#governanceDeliverables").innerHTML = GOVERNANCE_DOCS.map(
    (documentName, index) => {
      const status = state.governance[index] || "pending";
      return `<div class="deliverable" data-status="${status}">
        <i aria-hidden="true"></i>
        <div class="deliverable-main">
          <b>${documentName}</b>
          <small>Responsable: Gobierno BES · Evidencia requerida</small>
        </div>
        <button class="status-button" data-gov="${index}" aria-label="Cambiar estado de ${documentName}">${GOV_STATUS[status].label}</button>
      </div>`;
    },
  ).join("");
  selectAll("[data-gov]").forEach((button) => {
    button.onclick = () => cycleGovernance(Number(button.dataset.gov));
  });
  select("#folderTree").innerHTML = SECTIONS.map(
    (section) => `<span>${section}</span>`,
  ).join("");
}

function renderIdentity() {
  const name = state.profile.name;
  select("#userName").textContent = name;
  select("#userRole").textContent = state.profile.role;
  select("#userAvatar").textContent = name.trim().charAt(0).toUpperCase() || "B";
  select("#greetingName").textContent = name;
}

function renderAll() {
  document.documentElement.dataset.theme = state.theme || "light";
  select("#today").textContent = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  renderIdentity();
  renderTasks();
  renderLinks();
  renderAudit();
  renderArchitecture();
}

function roleLabel(membership) {
  const labels = {
    owner: "Propietario y creador",
    admin: "Administrador de plataforma",
    platform_admin: "Administrador de plataforma",
    architect: "Arquitecto BES",
    manager: "Responsable de área",
    analyst: "Analista",
    auditor: "Auditor",
    operator: "Operador",
    viewer: "Consulta",
  };
  return labels[membership?.role_code] || membership?.role_code || "Usuario BES";
}

function membershipRoles(membership) {
  return new Set([
    membership?.role_code,
    ...(Array.isArray(membership?.additional_roles)
      ? membership.additional_roles
      : []),
  ]);
}

function requiresMfa(membership) {
  return [...membershipRoles(membership)].some((role) =>
    PRIVILEGED_ROLES.has(role),
  );
}

function pickActiveAccess(context) {
  const organizations = Array.isArray(context?.organizations)
    ? context.organizations
    : [];
  return (
    organizations.find(
      (organization) =>
        organization.status === "active" &&
        organization.membership_status === "active",
    ) || null
  );
}

function credentialExpired(membership) {
  if (!membership?.temporary_password_expires_at) return false;
  const expiresAt = Date.parse(membership.temporary_password_expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function showAuthSurface(surface) {
  const surfaces = ["loginView", "passwordView", "mfaView", "appView"];
  surfaces.forEach((id) => {
    select(`#${id}`).classList.toggle("hidden", id !== surface);
  });
}

function setSecurityMessage(message, isError = false) {
  const element = select("#mfaView").classList.contains("hidden")
    ? select("#securityMessage")
    : select("#mfaMessage");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function resetSensitiveForms() {
  select("#password").value = "";
  select("#newPassword").value = "";
  select("#confirmPassword").value = "";
  select("#mfaCode").value = "";
  select("#mfaEnrollCode").value = "";
  select("#mfaSetup").classList.add("hidden");
  select("#mfaChallenge").classList.add("hidden");
  select("#mfaEnrollIntro").classList.add("hidden");
  select("#mfaQr").removeAttribute("src");
  select("#mfaSecret").textContent = "";
  enrollmentFactorId = null;
  challengeFactorId = null;
}

function clearRuntimeIdentity() {
  currentUser = null;
  accessContext = null;
  activeAccess = null;
  state = null;
  authEvaluation += 1;
}

async function fetchAccessContext() {
  const { data, error } = await supabase.rpc("get_my_access_context");
  if (error) throw error;
  if (!data?.authenticated) {
    throw new Error("La sesión no tiene un contexto de acceso válido.");
  }
  return data;
}

function translateAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirma tu correo antes de ingresar.";
  }
  if (message.includes("rate limit")) {
    return "Demasiados intentos. Espera unos minutos e inténtalo nuevamente.";
  }
  return "No fue posible completar el acceso. Inténtalo nuevamente.";
}

async function evaluateSession(session) {
  const evaluation = ++authEvaluation;
  if (!session?.user) {
    clearRuntimeIdentity();
    resetSensitiveForms();
    showAuthSurface("loginView");
    return;
  }

  currentUser = session.user;
  try {
    const context = await fetchAccessContext();
    if (evaluation !== authEvaluation) return;
    const membership = pickActiveAccess(context);
    if (!context.profile?.active || !membership) {
      throw new Error("Tu perfil BES no está activo o no tiene una membresía válida.");
    }

    accessContext = context;
    activeAccess = membership;
    state = loadState(
      currentUser.id,
      profileFromContext(accessContext, activeAccess),
    );

    if (membership.must_change_password) {
      if (credentialExpired(membership)) {
        throw new Error(
          "Tu contraseña temporal venció. Solicita al propietario una nueva credencial de primer acceso.",
        );
      }
      if (!["temporary", "reset_required"].includes(membership.credential_state)) {
        throw new Error("La credencial BES requiere revisión antes de continuar.");
      }
      select("#passwordAccountName").textContent = state.profile.name;
      setSecurityMessage(
        "Define una contraseña personal antes de utilizar cualquier módulo.",
      );
      showAuthSurface("passwordView");
      return;
    }

    if (
      membership.credential_state !== "active" ||
      membership.access_ready !== true
    ) {
      throw new Error(
        "La credencial BES está bloqueada, inactiva o todavía no está autorizada.",
      );
    }

    if (requiresMfa(membership)) {
      await routePrivilegedMfa(evaluation);
      return;
    }

    enterPortal();
  } catch (error) {
    if (evaluation !== authEvaluation) return;
    clearRuntimeIdentity();
    showAuthSurface("loginView");
    select("#loginError").textContent =
      error.message ||
      "Tu perfil todavía no cuenta con acceso activo a esta plataforma.";
    await supabase.auth.signOut({ scope: "local" });
  }
}

async function routePrivilegedMfa(evaluation) {
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (evaluation !== authEvaluation) return;
  if (assurance.currentLevel === "aal2") {
    enterPortal();
    return;
  }

  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  if (factorsError) throw factorsError;
  if (evaluation !== authEvaluation) return;
  const totpFactors = factors.totp || [];
  const verifiedFactor = totpFactors.find(
    (factor) => factor.status === "verified",
  );
  if (!verifiedFactor) {
    const incompleteFactors = totpFactors.filter(
      (factor) => factor.status === "unverified",
    );
    for (const factor of incompleteFactors) {
      const { error: cleanupError } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });
      if (cleanupError) throw cleanupError;
    }
  }
  showAuthSurface("mfaView");
  select("#mfaRoleDescription").textContent = state.profile.role;
  if (verifiedFactor) {
    challengeFactorId = verifiedFactor.id;
    select("#mfaChallenge").classList.remove("hidden");
    select("#mfaEnrollIntro").classList.add("hidden");
    setSecurityMessage(
      "Ingresa el código de seis dígitos de tu aplicación autenticadora.",
    );
  } else {
    select("#mfaChallenge").classList.add("hidden");
    select("#mfaEnrollIntro").classList.remove("hidden");
    setSecurityMessage(
      "Tu rol requiere una segunda verificación. Configúrala ahora para proteger la plataforma.",
    );
  }
}

async function startMfaEnrollment() {
  const button = select("#mfaEnrollBtn");
  button.disabled = true;
  setSecurityMessage("Preparando tu autenticador…");
  try {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "BES Access Portal",
    });
    if (error) throw error;
    enrollmentFactorId = data.id;
    const qrCode = data.totp?.qr_code || "";
    if (!/^data:image\/(?:svg\+xml|png);/i.test(qrCode)) {
      throw new Error("Supabase no devolvió un código QR válido.");
    }
    select("#mfaQr").src = qrCode;
    select("#mfaSecret").textContent = data.totp?.secret || "";
    select("#mfaEnrollIntro").classList.add("hidden");
    select("#mfaSetup").classList.remove("hidden");
    setSecurityMessage(
      "Escanea el código QR y confirma con el código de seis dígitos.",
    );
    select("#mfaEnrollCode").focus();
  } catch {
    setSecurityMessage(
      "No fue posible iniciar la configuración MFA. Cierra sesión e inténtalo nuevamente.",
      true,
    );
  } finally {
    button.disabled = false;
  }
}

async function verifyMfaFactor(factorId, code, input) {
  if (!factorId || !/^\d{6}$/.test(code)) {
    setSecurityMessage("Ingresa un código válido de seis dígitos.", true);
    input.focus();
    return;
  }
  try {
    setSecurityMessage("Verificando código…");
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) throw error;
    input.value = "";
    select("#mfaQr").removeAttribute("src");
    select("#mfaSecret").textContent = "";
    select("#mfaSetup").classList.add("hidden");
    select("#mfaChallenge").classList.add("hidden");
    enrollmentFactorId = null;
    challengeFactorId = null;
    const { data } = await supabase.auth.getSession();
    await evaluateSession(data.session);
  } catch {
    setSecurityMessage(
      "El código no fue aceptado o expiró. Genera uno nuevo e inténtalo otra vez.",
      true,
    );
    input.select();
  }
}

async function changePassword(event) {
  event.preventDefault();
  const newPassword = select("#newPassword").value;
  const confirmation = select("#confirmPassword").value;
  if (newPassword.length < 12) {
    setSecurityMessage("La contraseña debe tener al menos 12 caracteres.", true);
    return;
  }
  if (newPassword !== confirmation) {
    setSecurityMessage("Las contraseñas no coinciden.", true);
    return;
  }
  const button = select("#passwordSubmit");
  button.disabled = true;
  try {
    setSecurityMessage("Actualizando tu contraseña…");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    const { error: activationError } = await supabase.rpc(
      "complete_first_login",
    );
    if (activationError) throw activationError;
    select("#newPassword").value = "";
    select("#confirmPassword").value = "";
    await supabase.auth.refreshSession();
    accessContext = await fetchAccessContext();
    activeAccess = pickActiveAccess(accessContext);
    if (!activeAccess || activeAccess.must_change_password) {
      throw new Error("La activación de la credencial aún no se confirmó.");
    }
    state.profile = profileFromContext(accessContext, activeAccess);
    persist();
    toast("Contraseña actualizada");
    if (requiresMfa(activeAccess)) {
      await routePrivilegedMfa(authEvaluation);
    } else {
      enterPortal();
    }
  } catch (error) {
    setSecurityMessage(
      error.message ||
        "No fue posible actualizar la contraseña. Inténtalo nuevamente.",
      true,
    );
  } finally {
    button.disabled = false;
  }
}

function enterPortal() {
  renderAll();
  showAuthSurface("appView");
  showPage("dashboard");
}

async function signIn(event) {
  event.preventDefault();
  if (!supabase) return;
  const button = select("#loginSubmit");
  const email = select("#email").value.trim();
  const password = select("#password").value;
  button.disabled = true;
  select("#loginError").textContent = "";
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    select("#password").value = "";
    if (error) throw error;
    await evaluateSession(data.session);
  } catch (error) {
    select("#password").value = "";
    select("#loginError").textContent = translateAuthError(error);
  } finally {
    button.disabled = false;
  }
}

async function signOut() {
  if (state) logEvent("Cerró sesión");
  resetSensitiveForms();
  clearRuntimeIdentity();
  showAuthSurface("loginView");
  if (supabase) {
    await supabase.auth.signOut({ scope: "local" });
  }
}

function bindEvents() {
  select("#loginForm").addEventListener("submit", signIn);
  select("#demoProfiles").onclick = () =>
    toast("Los accesos se asignan de forma individual por área y puesto");
  select("#logout").onclick = signOut;
  select("#passwordLogout").onclick = signOut;
  select("#mfaLogout").onclick = signOut;
  select("#passwordForm").addEventListener("submit", changePassword);
  select("#mfaEnrollBtn").onclick = startMfaEnrollment;
  select("#mfaSetupForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = select("#mfaEnrollCode");
    void verifyMfaFactor(enrollmentFactorId, input.value.trim(), input);
  });
  select("#mfaChallengeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = select("#mfaCode");
    void verifyMfaFactor(challengeFactorId, input.value.trim(), input);
  });
  selectAll(".nav button").forEach((button) => {
    button.onclick = () => showPage(button.dataset.page);
  });
  selectAll("[data-go]").forEach((button) => {
    button.onclick = () => showPage(button.dataset.go);
  });
  select("#menuBtn").onclick = () => select("#sidebar").classList.toggle("open");
  select("#themeBtn").onclick = () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    persist();
    toast(`Tema ${state.theme === "dark" ? "oscuro" : "claro"}`);
  };
  select("#saveLinks").onclick = saveLinks;
  selectAll("#exportBtn,#exportTop").forEach((button) => {
    button.onclick = exportData;
  });
  select("#importInput").addEventListener("change", importData);
  [
    ["filterAll", "all"],
    ["filterPending", "pending"],
    ["filterDone", "done"],
  ].forEach(([id, filter]) => {
    select(`#${id}`).onclick = () => {
      taskFilter = filter;
      renderTasks();
      selectAll("#filterAll,#filterPending,#filterDone").forEach((button) => {
        button.className = "btn secondary";
      });
      select(`#${id}`).className = "btn";
    };
  });
  select("#resetGovernance").onclick = () => {
    state.governance = defaultGovernance();
    persist();
    logEvent("Restableció seguimiento de Gobierno BES");
    renderArchitecture();
    toast("Seguimiento restablecido");
  };
  selectAll(".private-document").forEach((button) => {
    button.onclick = () => {
      logEvent(
        `Solicitó documento ${button.dataset.docCode}; integración privada pendiente`,
      );
      toast("Documento pendiente de integración con Storage privado");
    };
  });
}

async function initialize() {
  bindEvents();
  selectAll("[data-app-version]").forEach((element) => {
    element.textContent = APP_VERSION;
  });
  if (!CONFIG_READY) {
    select("#loginSubmit").disabled = true;
    select("#runtimeNotice").classList.remove("hidden");
    select("#loginError").textContent =
      "La conexión segura todavía no tiene una clave publicable configurada.";
    return;
  }
  select("#runtimeNotice").classList.add("hidden");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await evaluateSession(session);
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    window.setTimeout(() => {
      void evaluateSession(nextSession);
    }, 0);
  });
}

void initialize();
