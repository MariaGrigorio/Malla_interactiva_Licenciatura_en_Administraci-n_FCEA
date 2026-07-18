// --- CONFIGURACIÓN DE ESTADOS GLOBALES ---
let listaMateriasOriginal = [];
let filtroSemestreActual = "1"; // Valor por defecto requerido: Semestre 1 filtrado

// --- INICIALIZACIÓN AL CARGAR EL DOCUMENTO ---
document.addEventListener("DOMContentLoaded", () => {
  cargarMateriasFcea();
  inicializarEventosFiltros();
  inicializarEventosResponsiveMobile();
});

// --- CARGA DE DATOS LOCALES (JSON MATERIAS ADMIN) ---
function cargarMateriasFcea() {
  // Simulamos o apuntamos al fetch de tu base de datos materias_admin.json
  fetch("materias_admin.json")
    .then(response => {
      if (!response.ok) throw new Error("No se pudo cargar el archivo de materias.");
      return response.json();
    })
    .then(data => {
      listaMateriasOriginal = data;
      
      // Renderizado y cálculo inicial (Arranca directamente filtrado por el Semestre 1)
      filtrarYRenderizarMaterias();
      actualizarKPIDashboard();
    })
    .catch(error => {
      console.error("Error cargando materias:", error);
      // Fallback por si la red falla localmente mientras pruebas
      listaMateriasOriginal = [];
    });
}

// --- VINCULACIÓN DE ESCUCHADORES DE FILTROS ---
function inicializarEventosFiltros() {
  // Entradas Estándar
  document.getElementById("search-input").addEventListener("input", filtrarYRenderizarMaterias);
  document.getElementById("filter-area").addEventListener("change", filtrarYRenderizarMaterias);
  document.getElementById("filter-tipo").addEventListener("change", filtrarYRenderizarMaterias);
  document.getElementById("filter-estado").addEventListener("change", filtrarYRenderizarMaterias);
  document.getElementById("filter-previas").addEventListener("change", filtrarYRenderizarMaterias);
  document.getElementById("trayectoria-calculo").addEventListener("change", filtrarYRenderizarMaterias);

  // Lógica para los nuevos 8 Botones de Semestre + Botón Todos
  const botonesSemestre = document.querySelectorAll(".btn-semestre");
  botonesSemestre.forEach(boton => {
    boton.addEventListener("click", (e) => {
      // Remover estado activo previo de toda la lista de botones
      botonesSemestre.forEach(b => b.classList.remove("active"));
      
      // Asignar clase activa al botón presionado
      e.currentTarget.classList.add("active");
      
      // Modificar el filtro global con el atributo del botón
      filtroSemestreActual = e.currentTarget.getAttribute("data-semestre");
      
      // Ejecutar filtrado en tiempo real
      filtrarYRenderizarMaterias();

      // En móviles, cerramos automáticamente el panel al hacer tap en un semestre para ver resultados
      if (window.innerWidth <= 950) {
        document.getElementById("semestres-sidebar").classList.remove("open");
      }
    });
  });
}

// --- MANEJO DE APERTURA/CIERRE DE PANELES FLOTANTES EN MOBILE ---
function inicializarEventosResponsiveMobile() {
  // Selectores de los Triggers Flotantes Inferiores
  const btnOpenFilters = document.getElementById("btn-open-filters");
  const btnOpenSemestres = document.getElementById("btn-open-semestres");
  
  // Selectores de los Botones de Cerrar (X) de los Modales
  const btnCloseFilters = document.getElementById("btn-close-filters");
  const btnCloseSemestres = document.getElementById("btn-close-semestres");
  
  // Elementos de los Contenedores
  const filtersSidebar = document.getElementById("filters-sidebar");
  const semestresSidebar = document.getElementById("semestres-sidebar");

  // Eventos de apertura
  if (btnOpenFilters) {
    btnOpenFilters.addEventListener("click", () => {
      filtersSidebar.classList.add("open");
      semestresSidebar.classList.remove("open"); // Evita superposición
    });
  }
  
  if (btnOpenSemestres) {
    btnOpenSemestres.addEventListener("click", () => {
      semestresSidebar.classList.add("open");
      filtersSidebar.classList.remove("open"); // Evita superposición
    });
  }

  // Eventos de cierre (X)
  if (btnCloseFilters) {
    btnCloseFilters.addEventListener("click", () => {
      filtersSidebar.classList.remove("open");
    });
  }
  
  if (btnCloseSemestres) {
    btnCloseSemestres.addEventListener("click", () => {
      semestresSidebar.classList.remove("open");
    });
  }
}

// --- FUNCIÓN NUCLEAR: FILTRADO COMPUESTO DE MATERIAS ---
function filtrarYRenderizarMaterias() {
  const queryBuscar = document.getElementById("search-input").value.toLowerCase().trim();
  const areaFiltro = document.getElementById("filter-area").value;
  const tipoFiltro = document.getElementById("filter-tipo").value;
  const estadoFiltro = document.getElementById("filter-estado").value;
  const previasFiltro = document.getElementById("filter-previas").value;

  // Filtrar arreglo original basándonos en criterios
  const resultadoFiltrado = listaMateriasOriginal.filter(materia => {
    
    // 1. FILTRO DE SEMESTRE MODIFICADO (Utiliza los botones y la variable global)
    if (filtroSemestreActual !== "todos") {
      if (materia.semestre.toString() !== filtroSemestreActual) {
        return false;
      }
    }

    // 2. Filtro por caja de búsqueda por nombre
    if (queryBuscar && !materia.nombre.toLowerCase().includes(queryBuscar)) {
      return false;
    }

    // 3. Filtro por Área Temática
    if (areaFiltro && materia.area !== areaFiltro) {
      return false;
    }

    // 4. Filtro por Tipo de Carácter (OB / OP)
    if (tipoFiltro && materia.tipo !== tipoFiltro) {
      return false;
    }

    // 5. Filtro por Estados guardados (Simulado, usando localStorage en tu app)
    const estadoGuardado = localStorage.getItem(`materia_estado_${materia.id}`) || "pendiente";
    if (estadoFiltro && estadoGuardado !== estadoFiltro) {
      return false;
    }

    // 6. Filtro por Estado de Previas Habilitadas/Bloqueadas (Simulación de tu lógica estructural)
    if (previasFiltro) {
      const estaHabilitada = comprobarPreviasMateria(materia);
      if (previasFiltro === "disponible" && !estaHabilitada) return false;
      if (previasFiltro === "bloqueada" && estaHabilitada) return false;
    }

    return true;
  });

  // Renderizar la lista resultante en el DOM
  renderizarCardsEnMalla(resultadoFiltrado);
}

// --- RENDERIZACIÓN DE TARJETAS EN EL CONTENEDOR HTML ---
function renderizarCardsEnMalla(materias) {
  const contenedor = document.getElementById("list");
  if (!contenedor) return;
  
  contenedor.innerHTML = "";

  if (materias.length === 0) {
    contenedor.innerHTML = `<div class="no-results-alert">No se encontraron materias con los filtros seleccionados.</div>`;
    return;
  }

  materias.forEach(materia => {
    const estado = localStorage.getItem(`materia_estado_${materia.id}`) || "pendiente";
    
    const card = document.createElement("div");
    card.className = `materia-card status-${estado}`;
    card.setAttribute("data-id", materia.id);
    
    card.innerHTML = `
      <div class="card-header-info">
        <span class="materia-code">${materia.id}</span>
        <span class="materia-creditos">${materia.creditos} <small>Créditos</small></span>
      </div>
      <h4 class="materia-title">${materia.nombre}</h4>
      <div class="card-footer-info">
        <span class="materia-badge-area">${materia.area}</span>
        <span class="materia-badge-semestre">${materia.semestre}° Sem</span>
      </div>
    `;
    
    contenedor.appendChild(card);
  });
}

// --- AUXILIARES SIMULADOS (Mantenlos sincronizados con tus funciones existentes) ---
function comprobarPreviasMateria(materia) {
  // Aquí corre tu lógica recursiva que analiza si cumple con las previas aprobadas
  return true; 
}

function actualizarKPIDashboard() {
  // Lógica existente de conteo y reducción de créditos ganados de localStorage
  console.log("Métricas calculadas.");
}
