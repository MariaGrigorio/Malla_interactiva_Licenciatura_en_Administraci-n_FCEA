/* =========================================================
   Grilla · Administración (UDELAR) - Unificado con Firebase
   ========================================================= */

(function () {
  "use strict";

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

  // ==========================================
  // 1. INICIALIZACIÓN DE FIREBASE
  // ==========================================
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(window.FB_CONFIG || {});
  }
  const auth = firebase.auth();
  const db = firebase.firestore();

  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const badge = document.getElementById('userBadge');

  loginBtn?.addEventListener('click', async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (e) { console.error(e); }
  });

  logoutBtn?.addEventListener('click', async () => {
    await auth.signOut();
    location.reload();
  });

  const progressRef = () => auth.currentUser ? db.collection('progress').doc(auth.currentUser.uid) : null;

  let saveTimer = null;
  function cloudSaveDebounced(ms = 600) {
    const r = progressRef(); 
    if (!r) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const payload = {
          aprobadas: Array.from(state.aprobadas),
          cursando: Array.from(state.cursando),
          planeadas: Array.from(state.planeadas),
          trayectoriaCalculo: state.trayectoriaCalculo,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await r.set(payload, { merge: true });
      } catch(e) { console.error("Error al guardar en la nube", e); }
    }, ms);
  }

  async function cloudLoad() {
    const r = progressRef();
    if (!r) return null;
    const s = await r.get();
    return s.exists ? s.data() : null;
  }

  // ==========================================
  // 2. MANEJO DE ESTADO
  // ==========================================
  function saveState() {
    try {
      const obj = {
        aprobadas: Array.from(state.aprobadas),
        cursando: Array.from(state.cursando),
        planeadas: Array.from(state.planeadas),
        trayectoriaCalculo: state.trayectoriaCalculo,
      };
      localStorage.setItem(stateKey, JSON.stringify(obj));
    } catch (e) { console.warn("No se pudo guardar local:", e); }
    
    if (auth.currentUser) cloudSaveDebounced();
  }

  function loadStateFromObj(obj) {
      state.aprobadas = new Set(obj.aprobadas || []);
      state.cursando = new Set(obj.cursando || []);
      state.planeadas = new Set(obj.planeadas || []);
      state.trayectoriaCalculo = obj.trayectoriaCalculo || null;
  }

  function loadLocalState() {
    const raw = localStorage.getItem(stateKey);
    if (raw) {
      try { loadStateFromObj(JSON.parse(raw)); } 
      catch (e) { console.warn("Error carga local:", e); }
    }
  }

  // ==========================================
  // 3. LÓGICA DE LA MALLA
  // ==========================================
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
    
    if (filtroSemestreActual !== "todos" && m.semestre.toString() !== filtroSemestreActual) return false;
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
    const total = state.data.materias.length;
    const aprobadas = state.data.materias.filter((m) => state.aprobadas.has(m.codigo)).length;
    const credTot = state.data.materias.reduce((s, m) => (m.tipo === "OB" || state.planeadas.has(m.codigo)) ? s + Number(m.creditos || 0) : s, 0);
    const credOk = state.data.materias.filter((m) => state.aprobadas.has(m.codigo)).reduce((s, m) => s + Number(m.creditos || 0), 0);

    if ($("#kpi-aprobadas")) $("#kpi-aprobadas").textContent = aprobadas;
    if ($("#kpi-totales")) $("#kpi-totales").textContent = total;
    if ($("#kpi-creditos")) $("#kpi-creditos").textContent = credOk;

    const pct = credTot ? Math.round((credOk / credTot) * 100) : 0;
    if ($("#progress-label")) $("#progress-label").textContent = `${pct}%`;
    if ($("#bar")) $("#bar").style.width = pct + "%";
  }

  function buildFilters() {
    const $area = $("#f-area");
    if ($area) {
      $area.innerHTML = '<option value="">Área: Todas</option>';
      state.data.areas.forEach((a) => $area.insertAdjacentHTML("beforeend", `<option value="${a.id}">${a.nombre}</option>`));
    }
  }

  function render() {
    const list = $("#list");
    if (!list) return;

    const items = state.data.materias.filter(matchesFilters).sort((a, b) => a.semestre - b.semestre || a.codigo.localeCompare(b.codigo));
    list.innerHTML = "";
    if (!items.length) { list.innerHTML = '<div class="empty">No hay materias.</div>'; updateKpis(); return; }

    const frag = document.createDocumentFragment();
    items.forEach((m) => {
      const est = getEstado(m.codigo);
      const locked = !canTake(m);
      
      const wrapper = document.createElement("div");
      // ESTILOS DE COLOR: Se inyecta la clase "aprobada", "cursando" o "pendiente"
      wrapper.className = `card course ${locked ? "locked" : ""} ${est}`;
      
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

    $$('input[data-cur]').forEach(el => el.onchange = (e) => { 
        e.target.checked ? state.cursando.add(e.target.dataset.cur) : state.cursando.delete(e.target.dataset.cur);
        saveState(); updateKpis(); render(); // Volvemos a renderizar para que cambie el color
    });
    $$('input[data-ok]').forEach(el => el.onchange = (e) => { 
        if(e.target.checked) { state.aprobadas.add(e.target.dataset.ok); state.cursando.delete(e.target.dataset.ok); }
        else { state.aprobadas.delete(e.target.dataset.ok); }
        limpiarMateriasHuerfanas(); saveState(); render(); 
    });
    updateKpis();
  }

  function wireUI() {
    $$("#q,#f-area,#f-tipo,#f-estado").forEach(el => el.oninput = el.onchange = render);
    
    $$(".btn-semestre").forEach(btn => btn.onclick = (e) => {
      $$(".btn-semestre").forEach(b => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      filtroSemestreActual = e.currentTarget.dataset.semestre;
      render();
    });

    // === MODAL OPTATIVAS ===
    if ($("#btn-open-optativas")) {
        $("#btn-open-optativas").onclick = () => {
          const list = $("#optativas-list");
          list.innerHTML = "";
          
          const optativas = state.data.materias.filter(m => m.tipo === 'OP');
          const optativasPorSemestre = {};
          
          optativas.forEach(m => {
              if (!optativasPorSemestre[m.semestre]) optativasPorSemestre[m.semestre] = [];
              optativasPorSemestre[m.semestre].push(m);
          });
          
          const semestresOrdenados = Object.keys(optativasPorSemestre).sort((a, b) => a - b);
          
          semestresOrdenados.forEach(sem => {
              const header = document.createElement('h4');
              header.style.margin = "15px 0 8px 0";
              header.style.color = "var(--brand, #6f42c1)";
              header.style.fontSize = "14px";
              header.style.borderBottom = "1px dashed #ccc";
              header.textContent = `Semestre ${sem}:`;
              list.appendChild(header);
              
              optativasPorSemestre[sem].forEach(m => {
                  const row = document.createElement('div');
                  row.style.display = "flex";
                  row.style.justifyContent = "space-between";
                  row.style.alignItems = "center";
                  row.style.padding = "6px 0";
                  row.style.fontSize = "13px";
                  
                  row.innerHTML = `
                    <span style="max-width: 85%;">${m.nombre}</span>
                    <input type="checkbox" data-plan="${m.codigo}" ${state.planeadas.has(m.codigo) ? 'checked' : ''} style="cursor: pointer; transform: scale(1.1);">
                  `;
                  list.appendChild(row);
              });
          });
          
          $("#modal-optativas").style.display = "flex";
        };
    }

    function guardarSeleccionOptativas() {
        $("#optativas-list").querySelectorAll('input[data-plan]').forEach(i => {
            i.checked ? state.planeadas.add(i.dataset.plan) : state.planeadas.delete(i.dataset.plan);
        });
        saveState(); 
        render();
    }

    if ($("#btn-close-optativas")) {
        $("#btn-close-optativas").onclick = () => {
          $("#modal-optativas").style.display = "none";
        };
    }

    if ($("#btn-save-optativas")) {
        $("#btn-save-optativas").onclick = () => {
          guardarSeleccionOptativas();
          $("#modal-optativas").style.display = "none";
        };
 // Botón para resetear todas las optativas
    if ($("#btn-reset-optativas")) {
        $("#btn-reset-optativas").onclick = () => {
          if(!confirm('¿Seguro que quieres desmarcar todas las optativas?')) return;
          
          // 1. Desmarcar visualmente todos los checkboxes en el modal
          $("#optativas-list").querySelectorAll('input[data-plan]').forEach(i => {
              i.checked = false;
          });
          
          // 2. Limpiar el estado interno y guardar en Firebase/Local
          state.data.materias.filter(m => m.tipo === 'OP').forEach(m => {
              state.planeadas.delete(m.codigo);
          });
          saveState(); 
          render(); // Actualizar la grilla de fondo
        };  
    }

    $("#btn-toggle-filters")?.addEventListener("click", () => $("#filters-container").classList.add("open"));
    $("#btn-close-filters")?.addEventListener("click", () => $("#filters-container").classList.remove("open"));
    $("#btn-toggle-semestres")?.addEventListener("click", () => $("#semestres-container").classList.add("open"));
    $("#btn-close-semestres")?.addEventListener("click", () => $("#semestres-container").classList.remove("open"));
    
    $("#btn-reset")?.addEventListener('click', async () => {
      if(!confirm('¿Seguro que querés borrar TODO tu avance?')) return;
      state.aprobadas.clear(); state.cursando.clear(); state.planeadas.clear();
      saveState();
      if (auth.currentUser) {
        const r = progressRef();
        if (r) await r.set({ aprobadas: [], cursando: [], planeadas: [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      render();
    });
  }

  async function loadData() {
    try {
      const r = await fetch(EXTERNAL_JSON_URL, { cache: "no-store" });
      const json = await r.json();
      state.data = { areas: json.areas || [], materias: json.materias || [] };
    } catch (e) { console.error("Error al cargar JSON de materias", e); }
  }

  // ==========================================
  // 4. ARRANQUE (INIT)
  // ==========================================
  function init() { 
      loadLocalState(); 
      loadData().then(() => {
          buildFilters(); 
          wireUI(); 
          render();
          
          auth.onAuthStateChanged(async (u) => {
            if (u) {
              if (loginBtn) loginBtn.style.display = 'none';
              if (logoutBtn) logoutBtn.style.display = 'inline-block';
              if (badge) { badge.style.display = 'inline-block'; badge.textContent = `Hola, ${u.displayName?.split(' ')[0] || 'Usuario'}`; }
              
              await db.collection('users').doc(u.uid).set({
                email: u.email,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
              
              const cloudData = await cloudLoad();
              if (cloudData) {
                  loadStateFromObj(cloudData); 
                  saveState(); 
                  render(); 
              } else {
                  cloudSaveDebounced(0);
              }
            } else {
              if (loginBtn) loginBtn.style.display = 'inline-block';
              if (logoutBtn) logoutBtn.style.display = 'none';
              if (badge) badge.style.display = 'none';
            }
          });
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
