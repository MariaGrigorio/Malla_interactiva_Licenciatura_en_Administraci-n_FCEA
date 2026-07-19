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
    
    try {
      const s = await r.get();
      return s.exists ? s.data() : null;
    } catch (e) {
      console.error("No se pudo cargar desde la nube. Revisa los permisos de Firestore:", e);
      return null;
    }
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
    // Lógica para filtrar las trayectorias de cálculo elegidas
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
      
      // --- 1. Calcular atributos dinámicos para la tarjeta ---
      const anio = Math.ceil(m.semestre / 2);
      const tipoText = m.tipo === "OB" ? "OBLIGATORIA" : (m.tipo === "OP" ? "OPTATIVA" : m.tipo);
      const previasText = Array.isArray(m.previas) && m.previas.length > 0 ? "Previas: " + m.previas.join(", ") : "Sin previas";
      
      // Buscar el nombre del área (ej: "MC - MÉTODOS CUANTITATIVOS")
      const areaObj = state.data.areas.find(a => a.id === m.area);
      const areaText = areaObj ? `${m.area} · ${areaObj.nombre}`.toUpperCase() : String(m.area).toUpperCase();
      const estadoUpper = est.toUpperCase();
      
      const wrapper = document.createElement("div");
      wrapper.className = `card course ${locked ? "locked" : ""} ${est}`;
      
      // --- 2. Nueva estructura visual idéntica a tu diseño ---
      wrapper.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 15px;">
          
          <div class="course-info" style="flex: 1; min-width: 260px;">
            <!-- Fila 1: Atributos y Etiquetas -->
            <div class="course-tags" style="display: flex; gap: 12px; align-items: center; margin-bottom: 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; flex-wrap: wrap;">
              <span class="badge-estado ${est}">${estadoUpper}</span>
              <span class="badge-area">${areaText}</span>
              <span>${anio}° AÑO - ${m.semestre}° SEM</span>
              <span>CRÉDITOS: ${m.creditos || 0}</span>
              <span>${tipoText}</span>
            </div>
            
            <!-- Fila 2: Título de la materia -->
            <h3 style="margin: 0 0 6px 0; font-size: 16px;">${m.codigo} — ${m.nombre}</h3>
            
            <!-- Fila 3: Previas -->
            <div style="font-size: 13px; color: var(--muted, #999);">${previasText}</div>
          </div>
          
          <!-- Checkboxes alineados a la derecha -->
          <div class="act" style="display: flex; flex-direction: column; gap: 10px; align-items: flex-end; min-width: 100px;">
            <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; cursor: pointer; user-select: none;">
              Cursando <input type="checkbox" data-cur="${m.codigo}" ${state.cursando.has(m.codigo) ? "checked" : ""} ${locked ? "disabled":""} style="transform: scale(1.2); cursor: pointer;">
            </label>
            <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; cursor: pointer; user-select: none;">
              Aprobada <input type="checkbox" data-ok="${m.codigo}" ${state.aprobadas.has(m.codigo) ? "checked" : ""} ${locked ? "disabled":""} style="transform: scale(1.2); cursor: pointer;">
            </label>
          </div>
          
        </div>
      `;
      frag.appendChild(wrapper);
    });
    list.appendChild(frag);

    $$('input[data-cur]').forEach(el => el.onchange = (e) => { 
        e.target.checked ? state.cursando.add(e.target.dataset.cur) : state.cursando.delete(e.target.dataset.cur);
        saveState(); updateKpis(); render(); 
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
    
    // === LÓGICA DE BOTONES DE SEMESTRES (¡Esto era lo que faltaba!) ===
    $$(".btn-semestre").forEach(btn => btn.onclick = (e) => {
      $$(".btn-semestre").forEach(b => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      filtroSemestreActual = e.currentTarget.dataset.semestre;
      render();
    });

    // === LÓGICA DEL SELECTOR DE CÁLCULO ===
    const selCalculo = $("#f-trayectoria-calculo");
    if (selCalculo) {
        selCalculo.value = state.trayectoriaCalculo || ""; 
        selCalculo.onchange = (e) => {
            if (!confirm('¿Seguro que quieres cambiar la trayectoria de cálculo?\n\nEsto borrará el avance que tengas guardado en las materias de la opción anterior.')) {
                e.target.value = state.trayectoriaCalculo || "";
                return;
            }
            
            const materiasCalculo = ["MC10", "114A", "128A"];
            materiasCalculo.forEach(cod => {
                state.aprobadas.delete(cod);
                state.cursando.delete(cod);
            });

            state.trayectoriaCalculo = e.target.value; 
            saveState(); 
            render();    
        };
    }

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
    } 

    if ($("#btn-reset-optativas")) {
        $("#btn-reset-optativas").onclick = () => {
          if(!confirm('¿Seguro que quieres desmarcar todas las optativas?')) return;
          
          $("#optativas-list").querySelectorAll('input[data-plan]').forEach(i => {
              i.checked = false;
          });
          
          state.data.materias.filter(m => m.tipo === 'OP').forEach(m => {
              state.planeadas.delete(m.codigo);
          });
          saveState(); 
          render(); 
        };  
    }

    // === BOTONES FLOTANTES MOBILE (Cierre automático cruzado) ===
    $("#btn-toggle-filters")?.addEventListener("click", () => {
        $("#filters-container").classList.add("open");
        $("#semestres-container").classList.remove("open"); 
    });
    $("#btn-close-filters")?.addEventListener("click", () => {
        $("#filters-container").classList.remove("open");
    });

    $("#btn-toggle-semestres")?.addEventListener("click", () => {
        $("#semestres-container").classList.add("open");
        $("#filters-container").classList.remove("open"); 
    });
    $("#btn-close-semestres")?.addEventListener("click", () => {
        $("#semestres-container").classList.remove("open");
    });
    
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

     // === LÓGICA DE LA GUÍA RÁPIDA (ONBOARDING) ===
    $("#btn-onboarding")?.addEventListener("click", () => {
        $("#onboarding").style.display = "flex";
    });
    $("#ob-close")?.addEventListener("click", () => {
        $("#onboarding").style.display = "none";
    });

    // === LÓGICA DEL MODO CLARO / OSCURO ===
    const themeBtn = $("#themeToggleBtn");
    if (themeBtn) {
        // Al cargar, revisamos si el usuario ya había elegido el modo claro
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-mode');
            themeBtn.textContent = '🌙'; // Cambia el ícono a la luna
        }
        
        // Al hacer clic, alternamos el modo
        themeBtn.addEventListener("click", () => {
            document.body.classList.toggle("light-mode");
            if (document.body.classList.contains("light-mode")) {
                localStorage.setItem("theme", "light");
                themeBtn.textContent = '🌙';
            } else {
                localStorage.setItem("theme", "dark");
                themeBtn.textContent = '☀️';
            }
        });
    }
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
          
          // Al cargar datos, nos aseguramos de reflejar la trayectoria de cálculo en el elemento select visual
          const selCalculo = $("#f-trayectoria-calculo");
          if (selCalculo) {
              selCalculo.value = state.trayectoriaCalculo || "";
          }

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
                  if (selCalculo) selCalculo.value = state.trayectoriaCalculo || "";
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
