/* =========================================================
   Grilla · Administración (UDELAR)
   Fuente de datos: /data/materias_admin.json
   ========================================================= */

(function () {
  "use strict";

  const USE_EXTERNAL_JSON = true;
  const EXTERNAL_JSON_URL = "data/materias_admin.json";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const stateKey = "grilla-admin-v1";
  const state = {
    aprobadas: new Set(),
    cursando: new Set(),
    planeadas: new Set(),
    trayectoriaCalculo: null,
    data: { areas: [], materias: [] },
  };

  function saveState() {
    try {
      const obj = {
        aprobadas: Array.from(state.aprobadas),
        cursando: Array.from(state.cursando),
        planeadas: Array.from(state.planeadas),
        trayectoriaCalculo: state.trayectoriaCalculo,
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
      state.planeadas = new Set(obj.planeadas || []);
      state.trayectoriaCalculo = obj.trayectoriaCalculo || null;
    } catch (e) {
      console.warn("No se pudo cargar el estado:", e);
    }
  }

  function areaName(id) {
    const a = state.data.areas.find((x) => x.id === id);
    return (a && a.nombre) || id || "";
  }

  function canTake(m) {
    const prev = Array.isArray(m.previas) ? m.previas : [];
    return prev.every((c) => state.aprobadas.has(String(c).trim()));
  }

  function getEstado(cod) {
    if (state.aprobadas.has(cod)) return "aprobada";
    if (state.cursando.has(cod)) return "cursando";
    return "pendiente";
  }

  function limpiarMateriasHuerfanas() {
    let huboCambios = false;
    do {
      huboCambios = false;
      state.data.materias.forEach((materia) => {
        if (
          (state.aprobadas.has(materia.codigo) || state.cursando.has(materia.codigo) || state.planeadas.has(materia.codigo)) &&
          !canTake(materia)
        ) {
          state.aprobadas.delete(materia.codigo);
          state.cursando.delete(materia.codigo);
          state.planeadas.delete(materia.codigo);
          huboCambios = true;
        }
      });
    } while (huboCambios);
  }

  function matchesFilters(m) {
    if (state.trayectoriaCalculo === "MC10" && (m.codigo === "114A" || m.codigo === "128A")) return false;
    if (state.trayectoriaCalculo === "AB" && m.codigo === "MC10") return false;

    const q = ($("#q")?.value || "").trim().toLowerCase();
    const fa = $("#f-anio")?.value || "";
    const fs = $("#f-sem")?.value || "";
    const far = $("#f-area")?.value || "";
    const ft = $("#f-tipo")?.value || "";
    const fe = $("#f-estado")?.value || "";

    if (q && !(String(m.nombre).toLowerCase().includes(q) || String(m.codigo).toLowerCase().includes(q))) return false;
    if (fa && String(m.anio) !== fa) return false;
    if (fs && String(m.semestre) !== fs) return false;
    if (far && String(m.area) !== far) return false;
    if (ft && String(m.tipo) !== ft) return false;
    if (fe && getEstado(m.codigo) !== fe) return false;

    return true;
  }

  function updateKpis() {
    const materiasFiltradasPorCamino = state.data.materias.filter((m) => {
      if (state.trayectoriaCalculo === "MC10" && (m.codigo === "114A" || m.codigo === "128A")) return false;
      if (state.trayectoriaCalculo === "AB" && m.codigo === "MC10") return false;
      return true;
    });

    const total = materiasFiltradasPorCamino.length;
    const aprobadas = materiasFiltradasPorCamino.filter((m) => state.aprobadas.has(m.codigo)).length;

    const credTot = materiasFiltradasPorCamino.reduce((s, m) => {
      const esObligatoria = m.tipo === "OB";
      const esOpcionalElegida = m.tipo === "OP" && (state.planeadas.has(m.codigo) || state.cursando.has(m.codigo) || state.aprobadas.has(m.codigo));
      return (esObligatoria || esOpcionalElegida) ? s + Number(m.creditos || 0) : s;
    }, 0);

    const credOk = materiasFiltradasPorCamino.filter((m) => state.aprobadas.has(m.codigo)).reduce((s, m) => s + Number(m.creditos || 0), 0);

    $("#kpi-aprobadas") && ($("#kpi-aprobadas").textContent = aprobadas);
    $("#kpi-totales") && ($("#kpi-totales").textContent = total);
    $("#kpi-creditos") && ($("#kpi-creditos").textContent = credOk);

    const pct = credTot ? Math.round((credOk / credTot) * 100) : 0;
    $("#progress-label") && ($("#progress-label").textContent = `${pct}% · ${credOk}/${credTot} cr meta`);
    $("#bar") && ($("#bar").style.width = pct + "%");
  }

  function buildFilters() {
    const años = [...new Set(state.data.materias.map((m) => m.anio))].sort((a, b) => a - b);
    const sems = [...new Set(state.data.materias.map((m) => m.semestre))].sort((a, b) => a - b);
    const $anio = $("#f-anio"), $sem = $("#f-sem"), $area = $("#f-area");

    if ($anio) {
      $anio.innerHTML = '<option value="">Año: Todos</option>';
      años.forEach((v) => $anio.insertAdjacentHTML("beforeend", `<option value="${v}">${v}° Año</option>`));
    }
    if ($sem) {
      $sem.innerHTML = '<option value="">Semestre: Todos</option>';
      sems.forEach((v) => $sem.insertAdjacentHTML("beforeend", `<option value="${v}">${v}° Semestre</option>`));
    }
    if ($area) {
      $area.innerHTML = '<option value="">Área: Todas</option>';
      state.data.areas.forEach((a) => $area.insertAdjacentHTML("beforeend", `<option value="${a.id}">${a.nombre}</option>`));
    }

    // ELIMINADO EL LISTADO DE ÁREAS DEL SIDEBAR POR REDUNDANCIA
    const $sidebar = $("#sidebar-aside");
    if ($sidebar) {
      const selectorViejo = $(".calculo-selector-container");
      if (selectorViejo) selectorViejo.remove();

      // REUBICACIÓN MÓVIL/PC: Inyecta el selector al principio de la barra lateral
      const divCalculo = document.createElement("div");
      divCalculo.className = "card calculo-selector-container";
      divCalculo.innerHTML = `
        <h4 class="calculo-title" style="margin-top:0; margin-bottom: 12px;">¿Cursas Cálculo I o Cálculo I/A y I/B?</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="btn-tray-mc10" class="btn ${state.trayectoriaCalculo === 'MC10' ? 'btn-tray-active' : ''}" style="text-align: left; width: 100%;">
            Cálculo I (MC10)
          </button>
          <button id="btn-tray-ab" class="btn ${state.trayectoriaCalculo === 'AB' ? 'btn-tray-active' : ''}" style="text-align: left; width: 100%;">
            Cálculo I/A (114A) y I/B (128A)
          </button>
        </div>
      `;
      $sidebar.insertBefore(divCalculo, $sidebar.firstChild);

      $("#btn-tray-mc10").onclick = () => cambiarTrayectoria("MC10");
      $("#btn-tray-ab").onclick = () => cambiarTrayectoria("AB");
    }
  }

  function cambiarTrayectoria(tipo) {
    if (state.trayectoriaCalculo === tipo) return;
    
    if (state.trayectoriaCalculo !== null) {
      let tieneProgreso = false;
      if (state.trayectoriaCalculo === "MC10" && (state.aprobadas.has("MC10") || state.cursando.has("MC10"))) tieneProgreso = true;
      if (state.trayectoriaCalculo === "AB" && (state.aprobadas.has("114A") || state.cursando.has("114A") || state.aprobadas.has("128A") || state.cursando.has("128A"))) tieneProgreso = true;

      if (tieneProgreso) {
        if (!confirm("Atención: Si cambias de trayectoria se restablecerá tu progreso en el camino que abandonas. ¿Continuar?")) return;
      }
    }

    state.trayectoriaCalculo = tipo;
    if (tipo === "MC10") { state.aprobadas.delete("114A"); state.cursando.delete("114A"); state.aprobadas.delete("128A"); state.cursando.delete("128A"); }
    else { state.aprobadas.delete("MC10"); state.cursando.delete("MC10"); }

    limpiarMateriasHuerfanas();
    saveState();
    updateKpis();
    const selectorViejo = $(".calculo-selector-container");
    if (selectorViejo) selectorViejo.remove();
    buildFilters();
    render();
  }

  function render() {
    const list = $("#list");
    if (!list) return;

    const items = state.data.materias.filter(matchesFilters).sort((a, b) => a.anio - b.anio || a.semestre - b.semestre || String(a.codigo).localeCompare(String(b.codigo)));

    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = '<div class="empty">No hay materias que coincidan con los filtros.</div>';
      updateKpis();
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((m) => {
      const est = getEstado(m.codigo);
      const locked = !canTake(m); 
      const prev = Array.isArray(m.previas) ? m.previas : [];
      const prevText = prev.length ? `Previas: ${prev.map((c) => `<code>${c}</code>`).join(", ")}` : "Sin previas";
      const badgeClass = est === "aprobada" ? "ok" : est === "cursando" ? "cur" : "pen";
      const disabledAttr = locked ? "disabled" : "";

      const opcionalCheckHTML = m.tipo === "OP" 
        ? `<label class="muted">A cursar <input type="checkbox" data-plan="${m.codigo}" ${state.planeadas.has(m.codigo) ? "checked" : ""} ${disabledAttr}></label>` : "";

      const wrapper = document.createElement("div");
      wrapper.className = `card course ${locked ? "locked" : ""} ${est === "aprobada" ? "is-aprobada" : est === "cursando" ? "is-cursando" : ""}`;
      wrapper.innerHTML = `
        <div class="course-info">
          <div class="meta">
            <span class="badge ${badgeClass}">${est}</span>
            <span class="area">${m.area} · ${areaName(m.area)}</span>
            <span class="badge">${m.anio}° año · ${m.semestre}° sem</span>
            <span class="badge">${m.creditos} cr</span>
            <span class="badge">${m.tipo === "OB" ? "Obligatoria" : "Opcional"}</span>
          </div>
          <h3>${m.codigo} — ${m.nombre}</h3>
          <div class="course-footer">
            <small class="muted">${prevText}</small>
            ${locked ? `<div class="muted" style="font-size:12px; margin-top: 4px; color: #ef4444; font-weight: 500;">Bloqueada por previas.</div>` : ""}
          </div>
        </div>
        <div class="act">
          ${opcionalCheckHTML}
          <label class="muted">Cursando <input type="checkbox" data-cur="${m.codigo}" ${state.cursando.has(m.codigo) ? "checked" : ""} ${disabledAttr}></label>
          <label class="muted">Aprobada <input type="checkbox" data-ok="${m.codigo}" ${state.aprobadas.has(m.codigo) ? "checked" : ""} ${disabledAttr}></label>
        </div>
      `;
      frag.appendChild(wrapper);
    });

    list.appendChild(frag);

    $$('input[data-plan]').forEach((el) => el.onchange = () => { const c = el.getAttribute("data-plan"); el.checked ? state.planeadas.add(c) : state.planeadas.delete(c); saveState(); updateKpis(); });
    $$('input[data-cur]').forEach((el) => el.onchange = () => { const c = el.getAttribute("data-cur"); el.checked ? state.cursando.add(c) : state.cursando.delete(c); saveState(); updateKpis(); render(); });
    $$('input[data-ok]').forEach((el) => el.onchange = () => { const c = el.getAttribute("data-ok"); if (el.checked) { state.aprobadas.add(c); state.cursando.delete(c); } else { state.aprobadas.delete(c); } limpiarMateriasHuerfanas(); saveState(); updateKpis(); render(); });

    updateKpis();
  }

  function wireUI() {
    $$("#q,#f-anio,#f-sem,#f-area,#f-tipo,#f-estado").forEach((el) => {
      let t; el.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 120); });
      el.addEventListener("change", render);
    });

    const btnToggle = document.getElementById("btn-toggle-filters");
    const btnClose = document.getElementById("btn-close-filters");
    const filtersPanel = document.getElementById("filters-container");

    btnToggle?.addEventListener("click", () => filtersPanel?.classList.add("open"));
    btnClose?.addEventListener("click", () => filtersPanel?.classList.remove("open"));

    $("#btn-reset") && ($("#btn-reset").onclick = () => {
      if (confirm("¿Borrar todo el progreso guardado?")) {
        localStorage.removeItem(stateKey);
        state.aprobadas.clear(); state.cursando.clear(); state.planeadas.clear(); state.trayectoriaCalculo = null;
        render(); updateKpis();
      }
    });

    const $ob = $("#onboarding");
    $("#btn-onboarding") && ($("#btn-onboarding").onclick = () => $ob && ($ob.style.display = "flex"));
    $("#ob-close") && ($("#ob-close").onclick = () => $ob && ($ob.style.display = "none"));
    if ($ob && !localStorage.getItem("grilla-admin-onb")) { $ob.style.display = "flex"; localStorage.setItem("grilla-admin-onb", "1"); }
  }

  async function loadData() {
    if (!USE_EXTERNAL_JSON) return;
    try {
      const r = await fetch(EXTERNAL_JSON_URL, { cache: "no-store" });
      const json = await r.json();
      state.data = {
        areas: json.areas || [],
        materias: (json.materias || []).map((m) => ({ ...m, previas: Array.isArray(m.previas) ? m.previas : String(m.previas || "").split(/[,\\s;]+/).filter(Boolean) }))
      };
    } catch (e) {
      console.error(e);
    }
  }

  async function init() { loadState(); await loadData(); buildFilters(); wireUI(); render(); }
  document.readyState !== "loading" ? init() : document.addEventListener("DOMContentLoaded", init);
})();
