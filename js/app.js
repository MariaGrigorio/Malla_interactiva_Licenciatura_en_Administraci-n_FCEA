/* =========================================================
   Grilla · Administración (UDELAR)
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

  let filtroSemestreActual = "1"; 

  function saveState() {
    try {
      const obj = {
        aprobadas: Array.from(state.aprobadas),
        cursando: Array.from(state.cursando),
        planeadas: Array.from(state.planeadas),
        trayectoriaCalculo: state.trayectoriaCalculo,
      };
      localStorage.setItem(stateKey, JSON.stringify(obj));
    } catch (e) { console.warn("No se pudo guardar:", e); }
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
    } catch (e) { console.warn("Error carga:", e); }
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
      state.data.materias.forEach((m) => {
        if ((state.aprobadas.has(m.codigo) || state.cursando.has(m.codigo) || state.planeadas.has(m.codigo)) && !canTake(m)) {
          state.aprobadas.delete(m.codigo); state.cursando.delete(m.codigo); state.planeadas.delete(m.codigo);
          huboCambios = true;
        }
      });
    } while (huboCambios);
  }

  function matchesFilters(m) {
    if (state.trayectoriaCalculo === "MC10" && (m.codigo === "114A" || m.codigo === "128A")) return false;
    if (state.trayectoriaCalculo === "AB" && m.codigo === "MC10") return false;
    
    // Filtro Semestre
    if (filtroSemestreActual !== "todos" && m.semestre.toString() !== filtroSemestreActual) return false;

    // Filtro Optativas: Si es OP, solo mostrar si el usuario la seleccionó
    if (m.tipo === 'OP' && !state.planeadas.has(m.codigo)) return false;

    const q = ($("#q")?.value || "").trim().toLowerCase();
    const far = $("#f-area")?.value || "";
    const ft = $("#f-tipo")?.value || "";
    const fe = $("#f-estado")?.value || "";

    if (q && !(String(m.nombre).toLowerCase().includes(q) || String(m.codigo).toLowerCase().includes(q))) return false;
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
    $("#progress-label") && ($("#progress-label").textContent = `${pct}%`);
    $("#bar") && ($("#bar").style.width = pct + "%");
  }

  function buildFilters() {
    const $area = $("#f-area");
    if ($area) {
      $area.innerHTML = '<option value="">Área: Todas</option>';
      state.data.areas.forEach((a) => $area.insertAdjacentHTML("beforeend", `<option value="${a.id}">${a.nombre}</option>`));
    }
    if ($("#f-trayectoria-calculo")) $("#f-trayectoria-calculo").value = state.trayectoriaCalculo || "";
  }

  function cambiarTrayectoria(tipo) {
    if (state.trayectoriaCalculo === tipo) return;
    if (state.trayectoriaCalculo !== null) {
      if (!confirm("Atención: Si cambias de trayectoria se restablecerá el progreso. ¿Continuar?")) {
        if ($("#f-trayectoria-calculo")) $("#f-trayectoria-calculo").value = state.trayectoriaCalculo || "";
        return;
      }
    }
    state.trayectoriaCalculo = tipo ? tipo : null;
    if (tipo === "MC10") { state.aprobadas.delete("114A"); state.aprobadas.delete("128A"); }
    else if (tipo === "AB") { state.aprobadas.delete("MC10"); }
    limpiarMateriasHuerfanas(); saveState(); render();
  }

  function render() {
    const list = $("#list");
    if (!list) return;

    const items = state.data.materias.filter(matchesFilters).sort((a, b) => a.anio - b.anio || a.semestre - b.semestre || String(a.codigo).localeCompare(String(b.codigo)));
    list.innerHTML = "";
    if (!items.length) { list.innerHTML = '<div class="empty">No hay materias.</div>'; updateKpis(); return; }

    const frag = document.createDocumentFragment();
    items.forEach((m) => {
      const est = getEstado(m.codigo);
      const locked = !canTake(m);
      const wrapper = document.createElement("div");
      wrapper.className = `card course ${locked ? "locked" : ""}`;
      wrapper.innerHTML = `
        <div class="course-info"><h3>${m.codigo} — ${m.nombre}</h3><span class="badge">${m.semestre}° sem</span></div>
        <div class="act">
          <label>Cursando <input type="checkbox" data-cur="${m.codigo}" ${state.cursando.has(m.codigo) ? "checked" : ""} ${locked ? "disabled":""}></label>
          <label>Aprobada <input type="checkbox" data-ok="${m.codigo}" ${state.aprobadas.has(m.codigo) ? "checked" : ""} ${locked ? "disabled":""}></label>
        </div>
      `;
      frag.appendChild(wrapper);
    });
    list.appendChild(frag);
    // (Añadir listeners de checkbox aquí como en tu original)
    updateKpis();
  }

  function wireUI() {
    // --- LÓGICA DE OPTATIVAS ---
    $("#btn-open-optativas").onclick = () => {
      const list = $("#optativas-list");
      list.innerHTML = "";
      state.data.materias.filter(m => m.tipo === 'OP').forEach(m => {
        list.insertAdjacentHTML('beforeend', `<div><input type="checkbox" data-plan="${m.codigo}" ${state.planeadas.has(m.codigo) ? 'checked' : ''}> ${m.nombre} (Sem ${m.semestre})</div>`);
      });
      $("#modal-optativas").style.display = "flex";
    };

    $("#btn-close-optativas").onclick = () => {
      $("#modal-optativas").style.display = "none";
      $("#optativas-list").querySelectorAll('input').forEach(i => {
        i.checked ? state.planeadas.add(i.dataset.plan) : state.planeadas.delete(i.dataset.plan);
      });
      saveState(); render();
    };

    // ... (resto de listeners de filtros, reset, onboarding, modales) ...
  }

  async function loadData() {
    try {
      const r = await fetch(EXTERNAL_JSON_URL, { cache: "no-store" });
      const json = await r.json();
      state.data = { areas: json.areas || [], materias: json.materias || [] };
    } catch (e) { console.error(e); }
  }

  async function init() { loadState(); await loadData(); buildFilters(); wireUI(); render(); }
  init();
})();
