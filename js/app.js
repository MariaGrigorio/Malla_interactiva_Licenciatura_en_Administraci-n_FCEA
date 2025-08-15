/* =========================================================
   Grilla · Administración (UDELAR)
   Fuente de datos: /data/materias_admin.json
   Requisitos de DOM (IDs):
     progress-label, bar, kpi-aprobadas, kpi-totales, kpi-creditos
     q, f-estado, f-anio, f-sem, f-area, f-tipo
     list, areas-list
     quick-ob, quick-op, quick-clear
     btn-reset, btn-onboarding, onboarding, ob-close
   ========================================================= */

(function () {
  "use strict";

  const USE_EXTERNAL_JSON = true;
  const EXTERNAL_JSON_URL = "data/materias_admin.json";

  // Utils DOM
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Estado
  const stateKey = "grilla-admin-v1";
  const state = {
    aprobadas: new Set(),
    cursando: new Set(),
    data: { areas: [], materias: [] },
  };

  // ---------- Persistencia ----------
  function saveState() {
    try {
      const obj = {
        aprobadas: Array.from(state.aprobadas),
        cursando: Array.from(state.cursando),
      };
      localStorage.setItem(stateKey, JSON.stringify(obj));
    } catch (e) {
      console.warn("No se pudo guardar el estado:", e);
    }
  }

  function loadState() {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return;
    try {
      const obj = JSON.parse(raw);
      state.aprobadas = new Set(obj.aprobadas || []);
      state.cursando = new Set(obj.cursando || []);
    } catch (e) {
      console.warn("No se pudo cargar el estado:", e);
    }
  }

  // ---------- Helpers ----------
  function areaName(id) {
    const a = state.data.areas.find((x) => x.id === id);
    return (a && a.nombre) || id || "";
  }

  // Previas cumplidas = TODAS las previas están en aprobadas
  function canTake(m) {
    const prev = Array.isArray(m.previas) ? m.previas : [];
    return prev.every((c) => state.aprobadas.has(String(c).trim()));
  }

  function getEstado(cod) {
    if (state.aprobadas.has(cod)) return "aprobada";
    if (state.cursando.has(cod)) return "cursando";
    return "pendiente";
  }

  function matchesFilters(m) {
    const q = ($("#q")?.value || "").trim().toLowerCase();
    const fa = $("#f-anio")?.value || "";
    const fs = $("#f-sem")?.value || "";
    const far = $("#f-area")?.value || "";
    const ft = $("#f-tipo")?.value || "";
    const fe = $("#f-estado")?.value || "";

    if (
      q &&
      !(
        String(m.nombre).toLowerCase().includes(q) ||
        String(m.codigo).toLowerCase().includes(q)
      )
    )
      return false;
    if (fa && String(m.anio) !== fa) return false;
    if (fs && String(m.semestre) !== fs) return false;
    if (far && String(m.area) !== far) return false;
    if (ft && String(m.tipo) !== ft) return false;

    if (fe) {
      const est = getEstado(m.codigo);
      if (est !== fe) return false;
    }
    return true;
  }

  // ---------- UI: KPIs y barra ----------
  function updateKpis() {
    const total = state.data.materias.length;
    const aprobadas = state.data.materias.filter((m) =>
      state.aprobadas.has(m.codigo)
    ).length;
    const credTot = state.data.materias.reduce(
      (s, m) => s + Number(m.creditos || 0),
      0
    );
    const credOk = state.data.materias
      .filter((m) => state.aprobadas.has(m.codigo))
      .reduce((s, m) => s + Number(m.creditos || 0), 0);

    $("#kpi-aprobadas") && ($("#kpi-aprobadas").textContent = aprobadas);
    $("#kpi-totales") && ($("#kpi-totales").textContent = total);
    $("#kpi-creditos") && ($("#kpi-creditos").textContent = credOk);

    const pct = credTot ? Math.round((credOk / credTot) * 100) : 0;
    $("#progress-label") &&
      ($("#progress-label").textContent = `${pct}% · ${credOk}/${credTot} créditos`);
    $("#bar") && ($("#bar").style.width = pct + "%");
  }

  // ---------- UI: Filtros ----------
  function buildFilters() {
    const años = [...new Set(state.data.materias.map((m) => m.anio))].sort(
      (a, b) => a - b
    );
    const sems = [...new Set(state.data.materias.map((m) => m.semestre))].sort(
      (a, b) => a - b
    );
    const $anio = $("#f-anio"),
      $sem = $("#f-sem"),
      $area = $("#f-area");

    if ($anio) {
      años.forEach((v) => {
        $anio.insertAdjacentHTML(
          "beforeend",
          `<option value="${v}">${v}°</option>`
        );
      });
    }
    if ($sem) {
      sems.forEach((v) => {
        $sem.insertAdjacentHTML(
          "beforeend",
          `<option value="${v}">${v}°</option>`
        );
      });
    }
    if ($area) {
      state.data.areas.forEach((a) => {
        $area.insertAdjacentHTML(
          "beforeend",
          `<option value="${a.id}">${a.nombre}</option>`
        );
      });
    }

    // Lateral: listado de áreas
    const $areasList = $("#areas-list");
    if ($areasList) {
      $areasList.innerHTML = "";
      state.data.areas.forEach((a) => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = `${a.id} · ${a.nombre}`;
        $areasList.appendChild(span);
      });
    }

    // Accesos rápidos
    $("#quick-ob") &&
      $("#quick-ob").addEventListener("click", (e) => {
        e.preventDefault();
        $("#f-tipo").value = "OB";
        render();
      });
    $("#quick-op") &&
      $("#quick-op").addEventListener("click", (e) => {
        e.preventDefault();
        $("#f-tipo").value = "OP";
        render();
      });
    $("#quick-clear") &&
      $("#quick-clear").addEventListener("click", (e) => {
        e.preventDefault();
        $$("#f-anio,#f-sem,#f-area,#f-tipo,#f-estado").forEach(
          (el) => (el.value = "")
        );
        $("#q") && ($("#q").value = "");
        render();
      });
  }

  // ---------- UI: Render listado ----------
  function render() {
    const list = $("#list");
    if (!list) return;

    const items = state.data.materias
      .filter(matchesFilters)
      .sort(
        (a, b) =>
          a.anio - b.anio ||
          a.semestre - b.semestre ||
          String(a.codigo).localeCompare(String(b.codigo))
      );

    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML =
        '<div class="empty">No hay materias que coincidan con los filtros.</div>';
      updateKpis();
      return;
    }

    const frag = document.createDocumentFragment();

    items.forEach((m) => {
      const est = getEstado(m.codigo);
      const locked = !canTake(m) && est !== "aprobada" && est !== "cursando";
      const prev = Array.isArray(m.previas) ? m.previas : [];
      const prevText = prev.length
        ? `Previas: ${prev.map((c) => `<code>${c}</code>`).join(", ")}`
        : "Sin previas";

      const badgeClass = est === "aprobada" ? "ok" : est === "cursando" ? "cur" : "pen";
      const disabledAttr = locked ? "disabled" : "";

      const wrapper = document.createElement("div");
      wrapper.className = `course ${locked ? "locked" : ""}`;
      wrapper.innerHTML = `
        <div class="meta">
          <span class="badge ${badgeClass}">${est[0].toUpperCase()}${est.slice(1)}</span>
          <span class="area">${m.area} · ${areaName(m.area)}</span>
          <span class="badge">${m.anio}° año · ${m.semestre}° sem</span>
          <span class="badge">Créditos: ${m.creditos}</span>
          <span class="badge">${m.tipo === "OB" ? "Obligatoria" : "Opcional"}</span>
        </div>
        <div style="flex:1">
          <h3>${m.codigo} — ${m.nombre}</h3>
          <small class="muted">${prevText}</small>
          ${
            locked
              ? `<div class="muted" style="font-size:12px">Debes aprobar ${prev
                  .map((c) => `<b>${c}</b>`)
                  .join(", ")} para cursar.</div>`
              : ""
          }
        </div>
        <div class="act">
          <label class="muted">Cursando <input type="checkbox" data-cur="${m.codigo}" ${
        state.cursando.has(m.codigo) ? "checked" : ""
      } ${disabledAttr}></label>
          <label class="muted">Aprobada <input type="checkbox" data-ok="${m.codigo}" ${
        state.aprobadas.has(m.codigo) ? "checked" : ""
      }></label>
        </div>
      `;

      frag.appendChild(wrapper);
    });

    list.appendChild(frag);

    // Eventos de checks
    $$('input[data-cur]').forEach((el) => {
      el.onchange = () => {
        const cod = el.getAttribute("data-cur");
        if (el.checked) state.cursando.add(cod);
        else state.cursando.delete(cod);
        saveState();
        updateKpis();
        render(); // re-render para actualizar bloqueos
      };
    });
    $$('input[data-ok]').forEach((el) => {
      el.onchange = () => {
        const cod = el.getAttribute("data-ok");
        if (el.checked) {
          state.aprobadas.add(cod);
          state.cursando.delete(cod);
        } else {
          state.aprobadas.delete(cod);
        }
        saveState();
        updateKpis();
        render();
      };
    });

    updateKpis();
  }

  // ---------- Wire de UI ----------
  function wireUI() {
    // Filtros
    $$("#q,#f-anio,#f-sem,#f-area,#f-tipo,#f-estado").forEach((el) => {
      // Debounce simple para búsqueda
      let t;
      el.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(render, 120);
      });
      el.addEventListener("change", render);
    });

    // Reset progreso
    $("#btn-reset") &&
      ($("#btn-reset").onclick = () => {
        if (
          confirm(
            "Esto borrará tu progreso guardado en este navegador. ¿Deseas continuar?"
          )
        ) {
          localStorage.removeItem(stateKey);
          state.aprobadas.clear();
          state.cursando.clear();
          render();
          updateKpis();
        }
      });

    // Onboarding
    const seenKey = "grilla-admin-onb";
    const $ob = $("#onboarding");
    function openOnb() {
      if ($ob) $ob.style.display = "flex";
    }
    function closeOnb() {
      if ($ob) $ob.style.display = "none";
      localStorage.setItem(seenKey, "1");
    }
    $("#btn-onboarding") && ($("#btn-onboarding").onclick = openOnb);
    $("#ob-close") && ($("#ob-close").onclick = closeOnb);
    $ob &&
      $ob.addEventListener("click", (e) => {
        if (e.target === $ob) closeOnb();
      });
    if ($ob && !localStorage.getItem(seenKey)) openOnb();
  }

  // ---------- Carga de datos ----------
  async function loadData() {
    if (!USE_EXTERNAL_JSON) {
      console.error(
        "Config: USE_EXTERNAL_JSON=false. Ajusta el código si vas a incrustar datos locales."
      );
      state.data = { areas: [], materias: [] };
      return;
    }
    try {
      const r = await fetch(EXTERNAL_JSON_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();

      // Normalizar previas a array
      const materias = (json.materias || []).map((m) => ({
        ...m,
        previas: Array.isArray(m.previas)
          ? m.previas
          : typeof m.previas === "string" && m.previas.trim()
          ? m.previas.split(/[,\s;]+/).filter(Boolean)
          : [],
      }));

      state.data = {
        areas: Array.isArray(json.areas) ? json.areas : [],
        materias,
      };
    } catch (e) {
      console.error("No se pudo cargar el JSON externo:", e);
      state.data = { areas: [], materias: [] };
      const list = $("#list");
      list &&
        (list.innerHTML =
          '<div class="empty">Error cargando la malla. Revisa la ruta <code>data/materias_admin.json</code>.</div>');
    }
  }

  // ---------- Init ----------
  async function init() {
    loadState();
    await loadData();
    buildFilters();
    wireUI();
    render();
    updateKpis();
  }

  // GO!
  document.readyState !== "loading"
    ? init()
    : document.addEventListener("DOMContentLoaded", init);
})();
