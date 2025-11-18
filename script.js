// Importar jsPDF (asumiendo que los scripts de librería se cargan en index.html)
const { jsPDF } = window.jspdf;

// --------------------------------------
// Variables Globales y Constantes
// --------------------------------------
let routeData = []; 
let csvHeaders = []; 
const LOCAL_STORAGE_KEY = 'routeOrganizerLabData'; 
const MAX_STOP_TIME_MINUTES = 30; // Tiempo por parada en minutos
const DEFAULT_START_TIME = '05:00'; 

// Campos clave del CSV
const RAW_ADDRESS_FIELD = 'Direccion y Telefono del paciente '; 
const COMPANIA_FIELD = 'Tipo cliente';
const SOLICITUD_FIELD = 'N° Solicitud';

// Opciones de la lista desplegable de Observaciones
const OBSERVACIONES_OPTIONS = [
    { value: 'Pre y Post', text: 'Pre y Post' },
    { value: 'Pre y Post Con Cortisol', text: 'Pre y Post Con Cortisol' },
    { value: 'Cortisol', text: 'Cortisol' },
    { value: 'Prolactina', text: 'Prolactina' }
];

// Mapeo de estados de resaltado de FILA (Orden Manual) a clases CSS
const HIGHLIGHT_CLASSES = {
    1: 'highlight-manual-yellow',
    2: 'highlight-manual-blue',
    3: 'highlight-manual-pink',
    4: 'highlight-manual-green',
};

// Mapeo de estados de resaltado de CELDAS (Compañia, Solicitud, Observaciones)
const CELL_HIGHLIGHT_CLASSES = {
    'yellow': 'cell-highlight-yellow',
    'red': 'cell-highlight-red',
    'green': 'cell-highlight-green',
    'blue': 'cell-highlight-blue', // Color azul para FSFB
};

// ======================================
// CAMBIO 1: Colores de Resaltado de Fila más Oscuros para PDF
// (Para imprimir los colores de resaltado manual en el PDF)
// ======================================
const PDF_HIGHLIGHT_COLORS = {
    0: [255, 255, 255], // Blanco para el estado 0
    1: [253, 224, 71],  // Amarillo (yellow-300: #fde047)
    2: [147, 197, 253], // Azul (blue-300: #93c5fd)
    3: [249, 168, 212], // Rosado (pink-300: #f9a8d4)
    4: [110, 231, 183], // Verde (green-300: #6ee7b7)
};

// Mapeo de estados de resaltado de CELDAS a colores RGB para PDF [R, G, B]
const PDF_CELL_HIGHLIGHT_COLORS = {
    'yellow': [254, 240, 138], // yellow-300
    'red': [252, 165, 165],    // red-300
    'green': [110, 231, 183],  // green-300
    'blue': [147, 197, 253]    // blue-300 para FSFB
};

// Referencias del DOM y variables de Drag & Drop
const DOM = {
    fileUpload: document.getElementById('file-upload'),
    loadFileBtn: document.getElementById('load-file-btn'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    clearDataBtn: document.getElementById('clear-data-btn'),
    routeTableBody: document.getElementById('route-table-body'),
    startTimeInput: document.getElementById('start-time'),
    loadingOverlay: document.getElementById('loading-overlay'),
    messageBox: document.getElementById('message-box'),
    googleMapsLink: document.getElementById('google-maps-link'),
    lupapLink: document.getElementById('lupap-link'),
    customModal: document.getElementById('custom-modal'),
    // INCLUSIÓN: Referencia al botón del portal
    portalLinkBtn: document.getElementById('portal-link-btn')
};

let draggedItem = null; // Almacena el tr que se está arrastrando


// --------------------------------------
// Funciones de Utilidad (Tiempo y Almacenamiento)
// --------------------------------------

/**
 * Muestra un mensaje temporal en la esquina superior derecha.
 */
function showMessage(message, type) {
    DOM.messageBox.textContent = message;
    DOM.messageBox.className = `show msg-${type}`;
    setTimeout(() => {
        DOM.messageBox.className = DOM.messageBox.className.replace('show', '');
    }, 5000);
}

/**
 * Convierte una cadena de tiempo 'HH:MM' a minutos desde la medianoche.
 */
function timeToMinutes(timeStr) {
    if (!timeStr || timeStr.length !== 5 || timeStr[2] !== ':') return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Convierte minutos desde la medianoche a una cadena de tiempo 'HH:MM'.
 */
function minutesToTime(minutes) {
    const totalMinutes = Math.max(0, minutes) % (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Guarda los datos de la ruta en el Local Storage.
 */
function saveRouteToLocalStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(routeData));
    } catch (error) {
        console.error('Error al guardar en Local Storage:', error);
    }
    updateMapLinks();
}

/**
 * Carga los datos de la ruta desde el Local Storage.
 */
function loadRouteFromLocalStorage() {
    try {
        const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedData) {
            routeData = JSON.parse(storedData);
            // Asegura que los campos estén inicializados correctamente
            routeData.forEach(item => {
                item.manualHighlight = Number(item.manualHighlight || 0);
                item.numSecuencia = Number(item.numSecuencia || 0);
                item.observaciones = item.observaciones || ''; 
                item.observacionManual = item.observacionManual || ''; 
                item.cellHighlightTipo = item.cellHighlightTipo || ''; 
                item.cellHighlightSolicitud = item.cellHighlightSolicitud || ''; 
                item.cellHighlightObservaciones = item.cellHighlightObservaciones || ''; 
                item.manualOrder = Number(item.manualOrder || 0);
            });

            // ======================================
            // CAMBIO 2: CORRECCIÓN FSFB - Usar .trim() al cargar
            // (Asegura el resaltado azul si es FSFB al cargar desde el Local Storage)
            // ======================================
            routeData.forEach(item => {
                // Se asegura de eliminar espacios en el campo del CSV y poner en mayúsculas
                const isFSFB = (item[COMPANIA_FIELD] || '').trim().toUpperCase().includes('FSFB');
                item.cellHighlightTipo = isFSFB ? 'blue' : item.cellHighlightTipo;
            });

            sortRouteData(); 
            calculateEstimatedTimes(0);
            renderRouteTable();
            showMessage(`Ruta de ${routeData.length} pacientes cargada exitosamente.`, 'info');
            DOM.exportPdfBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error al cargar datos de Local Storage:', error);
        showMessage('No se pudieron cargar los datos previos.', 'error');
    }
}

// --------------------------------------
// Funciones de Lógica de Ruta y Ordenamiento
// --------------------------------------

/**
 * **[Implementación Clave]**
 * Ordena routeData:
 * 1. Primero por `manualOrder` (de 1 a N, luego 0 al final).
 * 2. Segundo por `estimatedTime` (hora menor a mayor) para las filas con el mismo `manualOrder` (incluyendo 0).
 * 3. Si el orden manual es 0, usa el número de secuencia original para desempate si la hora es la misma.
 */
function sortRouteData() {
    routeData.sort((a, b) => {
        // 1. Priorizar Orden Manual
        const manualA = a.manualOrder > 0 ? a.manualOrder : Infinity;
        const manualB = b.manualOrder > 0 ? b.manualOrder : Infinity;

        if (manualA !== manualB) {
            return manualA - manualB;
        }

        // 2. Si el Orden Manual es el mismo (incluyendo 0/Infinity), ordenar por Hora Estimada
        const timeA = timeToMinutes(a.estimatedTime);
        const timeB = timeToMinutes(b.estimatedTime);
        if (timeA !== timeB) {
            return timeA - timeB;
        }

        // 3. Desempate final (solo para filas con manualOrder=0 o manualOrder>0 iguales)
        // Si el orden manual es 0, usar el número de secuencia original para una estabilidad
        if (manualA === Infinity) {
             return a.numSecuencia - b.numSecuencia;
        }
        
        return 0; // Mantener el orden relativo si todo es igual
    });
    
    // Después de ordenar, recalcula los tiempos y las secuencias.
    calculateEstimatedTimes(0);
}

/**
 * Recalcula los tiempos estimados de llegada y asigna la secuencia.
 * @param {number} startIndex - Índice desde donde comenzar el cálculo (0 para recalcular todo).
 */
function calculateEstimatedTimes(startIndex = 0) {
    let currentTime = timeToMinutes(DOM.startTimeInput.value);

    // Si no se comienza desde 0, asegurar que currentTime inicia después del paciente anterior
    if (startIndex > 0 && routeData[startIndex - 1]) {
        const prevTimeMinutes = timeToMinutes(routeData[startIndex - 1].estimatedTime);
        currentTime = prevTimeMinutes + MAX_STOP_TIME_MINUTES;
    }

    for (let i = startIndex; i < routeData.length; i++) {
        const estimatedTime = minutesToTime(currentTime);

        routeData[i].estimatedTime = estimatedTime;
        routeData[i].numSecuencia = i + 1; // Re-asignar número de secuencia

        currentTime += MAX_STOP_TIME_MINUTES;
    }

    if (routeData.length > 0) {
        saveRouteToLocalStorage();
    }
}

/**
 * Actualiza un campo específico de un paciente.
 */
async function updateData(rowIndex, field, value, redraw = true) {
    const row = routeData[rowIndex];
    if (!row) return;

    // Lógica especial para Ordenamiento (Hora y Orden Manual)
    if (field === 'estimatedTime' || field === 'manualOrder') {
        if (field === 'estimatedTime' && !/^\d{2}:\d{2}$/.test(value)) {
            showMessage('Formato de hora inválido. Use HH:MM.', 'error');
            return;
        }
        const numValue = field === 'manualOrder' ? parseInt(value, 10) : value;
        if (field === 'manualOrder' && (isNaN(numValue) || numValue < 0)) {
            showMessage('El orden manual debe ser un número positivo (o 0 para deshabilitar).', 'error');
            return;
        }
        
        row[field] = numValue;
        
        // Reordenar toda la tabla y recalcular
        sortRouteData();
        renderRouteTable();
        showMessage(`Ruta reordenada por ${field === 'manualOrder' ? 'Orden Manual' : 'Hora Estimada'}.`, 'info');
        return;
    }
    
    // Lógica para campos de Resaltado (Fila y Celda)
    if (field === 'manualHighlight' || field.startsWith('cellHighlight')) {
        row[field] = value; // Guarda el valor (número o color string)
    } 
    
    // Lógica para Observaciones (Desplegable y Manual)
    else if (field === 'observaciones') {
        row[field] = value;
    }
    else if (field === 'observacionManual') {
        row[field] = value;
    }


    if (redraw) {
        saveRouteToLocalStorage();
        renderRouteTable();
        if (field === 'observacionManual' || field === 'observaciones') {
            showMessage(`Observaciones de ${row['Nombre Paciente']} actualizadas.`, 'success');
        } else {
            showMessage('Datos del paciente actualizados.', 'success');
        }
    }
}

/**
 * Alterna el color de resaltado de una celda entre amarillo, rojo, verde y ninguno.
 * Se añade la excepción para Tipo Cliente si es FSFB, que es fijo en azul.
 * @param {number} rowIndex - Índice del paciente en routeData.
 * @param {string} field - El nombre del campo que contiene la clase de resaltado (e.g., 'cellHighlightTipo').
 */
function toggleCellHighlight(rowIndex, field) {
    const row = routeData[rowIndex];
    
    // ======================================
    // CAMBIO 3: CORRECCIÓN FSFB - Usar .trim() al verificar
    // (Bloquea el toggle manual si la compañía es FSFB)
    // ======================================
    if (field === 'cellHighlightTipo' && (row[COMPANIA_FIELD] || '').trim().toUpperCase().includes('FSFB')) {
        // La compañía FSFB es de resaltado automático (azul), no permitir toggle manual.
        showMessage('El resaltado de la compañía FSFB es automático (Azul).', 'warning');
        return;
    }
    
    const currentColor = row[field] || '';
    let newColor = '';
    
    switch(currentColor) {
        case '': newColor = 'yellow'; break;
        case 'yellow': newColor = 'red'; break;
        case 'red': newColor = 'green'; break;
        case 'green': newColor = ''; break;
        default: newColor = ''; break;
    }
    
    updateData(rowIndex, field, newColor, true); 
}

/**
 * Alterna el color de resaltado de la fila (Orden Manual).
 * Secuencia: 0 (Ninguno/Blanco) -> 1 (Amarillo) -> 2 (Azul) -> 3 (Rosado) -> 4 (Verde) -> 0
 */
function toggleHighlight(rowIndex) {
    const row = routeData[rowIndex];
    if (!row) return;

    const currentHighlight = row.manualHighlight;
    const maxHighlight = Object.keys(HIGHLIGHT_CLASSES).length; // 4
    
    let nextHighlight = currentHighlight + 1;
    if (nextHighlight > maxHighlight) {
        nextHighlight = 0; // Vuelve a 0 (ningún resaltado)
    }

    updateData(rowIndex, 'manualHighlight', nextHighlight, true);
}


/**
 * Elimina una fila de la ruta.
 */
function deleteRow(rowIndex) {
    const patientName = routeData[rowIndex]['Nombre Paciente'];
    showCustomModal(`¿Está seguro de eliminar a ${patientName} de la ruta?`, () => {
        routeData.splice(rowIndex, 1);
        sortRouteData();
        renderRouteTable();
        DOM.exportPdfBtn.disabled = routeData.length === 0;
        showMessage(`${patientName} ha sido eliminado de la ruta.`, 'success');
    });
}

// --------------------------------------
// Renderizado y Drag & Drop
// --------------------------------------

/**
 * Obtiene la clase CSS para el resaltado de una celda.
 */
function getCellHighlightClass(color) {
    return CELL_HIGHLIGHT_CLASSES[color] || '';
}

/**
 * Renderiza la tabla de rutas en el DOM.
 */
function renderRouteTable() {
    DOM.routeTableBody.innerHTML = ''; 

    if (routeData.length === 0) {
        DOM.routeTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="p-6 text-center text-gray-500">
                    Cargue un archivo CSV para empezar a organizar la ruta.
                </td>
            </tr>
        `;
        DOM.exportPdfBtn.disabled = true;
        DOM.googleMapsLink.classList.remove('show');
        DOM.lupapLink.classList.remove('show');
        return;
    }

    routeData.forEach((row, i) => {
        // Si manualHighlight es 0, no aplicará ninguna clase de HIGHLIGHT_CLASSES
        const highlightClass = HIGHLIGHT_CLASSES[row.manualHighlight] || 'bg-white hover:bg-gray-50';
        
        const rowElement = document.createElement('tr');
        // Drag & Drop: Habilitar arrastre y guardar el índice
        rowElement.className = `${highlightClass} draggable-row transition duration-150 ease-in-out`;
        rowElement.setAttribute('draggable', 'true');
        rowElement.dataset.index = i; // Índice del paciente en el array ordenado actual
        
        // Adjuntar eventos de Drag & Drop a la fila
        rowElement.addEventListener('dragstart', handleDragStart);
        rowElement.addEventListener('dragover', handleDragOver);
        rowElement.addEventListener('dragleave', handleDragLeave);
        rowElement.addEventListener('drop', handleDrop);
        rowElement.addEventListener('dragend', handleDragEnd);

        // 1. Celda # Secuencia
        const sequenceCell = document.createElement('td');
        sequenceCell.className = 'px-2 py-2 border-b border-gray-200 text-sm text-center font-bold text-primary';
        sequenceCell.textContent = row.numSecuencia; // Ya viene recalculado y ordenado
        rowElement.appendChild(sequenceCell);

        // 2. Celda N° Orden Manual (Editable)
        const manualOrderCell = document.createElement('td');
        manualOrderCell.className = 'px-2 py-2 border-b border-gray-200 text-sm font-semibold whitespace-nowrap text-center';
        manualOrderCell.innerHTML = `
            <input type="number" value="${row.manualOrder > 0 ? row.manualOrder : ''}" 
                   class="w-16 p-1 border border-indigo-300 rounded-md text-center focus:ring-primary focus:border-primary transition duration-150 bg-transparent"
                   min="0"
                   placeholder="0"
                   onchange="updateData(${i}, 'manualOrder', this.value)">
        `;
        rowElement.appendChild(manualOrderCell);

        // 3. Celda Hora Estimada (Editable)
        const timeCell = document.createElement('td');
        timeCell.className = 'px-2 py-2 border-b border-gray-200 text-sm font-semibold whitespace-nowrap';
        timeCell.innerHTML = `
            <input type="time" value="${row.estimatedTime}" 
                   class="w-full p-1 border border-indigo-300 rounded-md focus:ring-primary focus:border-primary transition duration-150 bg-transparent"
                   onchange="updateData(${i}, 'estimatedTime', this.value)">
        `;
        rowElement.appendChild(timeCell);
        
        // 4. Celda Dirección / Tipo Cliente (Combinada)
        const addressCell = document.createElement('td');
        const tipoHighlightClass = getCellHighlightClass(row.cellHighlightTipo);
        addressCell.className = 'px-2 py-2 border-b border-gray-200 text-sm whitespace-normal max-w-xs';
        
        addressCell.innerHTML = `
            <div class="flex flex-col">
                <span class="font-medium text-gray-900">${row[RAW_ADDRESS_FIELD]}</span>
                <button onclick="toggleCellHighlight(${i}, 'cellHighlightTipo')" 
                        class="mt-1 flex items-center justify-start text-xs font-semibold py-1 px-2 rounded-full transition duration-150 ease-in-out w-fit ${tipoHighlightClass} text-gray-700 bg-gray-200 hover:bg-gray-300">
                    <span class="truncate">${row[COMPANIA_FIELD]}</span>
                </button>
            </div>
        `;
        rowElement.appendChild(addressCell);

        // 5. Celda Paciente / N° Solicitud (Combinada)
        const patientCell = document.createElement('td');
        const solicitudHighlightClass = getCellHighlightClass(row.cellHighlightSolicitud);
        patientCell.className = 'px-2 py-2 border-b border-gray-200 text-sm whitespace-nowrap';
        patientCell.innerHTML = `
            <div class="font-medium text-gray-900">${row['Nombre Paciente']}</div>
            <div class="text-gray-500 text-xs flex items-center">
                Doc: ${row['N° Documento']} | 
                <button onclick="toggleCellHighlight(${i}, 'cellHighlightSolicitud')" 
                        class="ml-1 px-1 py-0.5 rounded-sm ${solicitudHighlightClass} text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                    Sol: ${row[SOLICITUD_FIELD]}
                </button>
            </div>
        `;
        rowElement.appendChild(patientCell);
        
        // 6. Celda Observaciones (Nuevo Campo, Dropdown + Manual)
        const notesCell = document.createElement('td');
        const notesHighlightClass = getCellHighlightClass(row.cellHighlightObservaciones);
        notesCell.className = 'px-2 py-2 border-b border-gray-200 text-sm';
        
        let selectOptions = `<option value="">--- Seleccionar ---</option>`;
        OBSERVACIONES_OPTIONS.forEach(opt => {
            selectOptions += `<option value="${opt.value}" ${row.observaciones === opt.value ? 'selected' : ''}>${opt.text}</option>`;
        });

        notesCell.innerHTML = `
            <div class="flex flex-col gap-1">
                <select onchange="updateData(${i}, 'observaciones', this.value)"
                        class="w-full p-1 border border-gray-300 rounded-md text-xs focus:ring-primary focus:border-primary transition duration-150 bg-white">
                    ${selectOptions}
                </select>
                <div class="flex items-center">
                    <input type="text" 
                           value="${row.observacionManual || ''}"
                           class="flex-grow p-1 border border-gray-300 rounded-md text-xs focus:ring-primary focus:border-primary transition duration-150 bg-white ${notesHighlightClass}"
                           placeholder="Observación Manual..."
                           onchange="updateData(${i}, 'observacionManual', this.value, true)">
                    
                    <button onclick="toggleCellHighlight(${i}, 'cellHighlightObservaciones')" 
                            class="ml-1 px-1 py-1 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700 transition duration-150"
                            title="Resaltar Observación Manual">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
        rowElement.appendChild(notesCell);

        // 7. Celda Acciones
        const actionCell = document.createElement('td');
        actionCell.className = 'px-2 py-2 border-b border-gray-200 text-center text-sm whitespace-nowrap';
        actionCell.innerHTML = `
            <button onclick="toggleHighlight(${i})" 
                    class="table-action-btn bg-indigo-500 hover:bg-indigo-600 text-white mr-1 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Resaltar</span>
            </button>
            <button onclick="deleteRow(${i})" class="table-action-btn bg-red-500 hover:bg-red-600 text-white mr-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Eliminar</span>
            </button>
        `;
        rowElement.appendChild(actionCell);

        DOM.routeTableBody.appendChild(rowElement);
    });
    
    DOM.googleMapsLink.classList.add('show');
    DOM.lupapLink.classList.add('show');
}

/**
 * Lógica de Drag & Drop: Inicio del arrastre.
 */
function handleDragStart(e) {
    draggedItem = e.target;
    e.dataTransfer.setData('text/html', draggedItem.outerHTML);
    e.dataTransfer.effectAllowed = 'move';
    // Usar setTimeout para aplicar 'dragging' después de que el navegador capture la imagen de arrastre
    setTimeout(() => {
        draggedItem.classList.add('dragging');
    }, 0);
}

/**
 * Lógica de Drag & Drop: Elemento arrastrado sobre otro.
 */
function handleDragOver(e) {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('tr');
    if (target && target !== draggedItem) {
        // Eliminar clases de drop de todos
        Array.from(DOM.routeTableBody.children).forEach(row => {
            row.classList.remove('drop-zone-above', 'drop-zone-below');
        });

        // Determinar si la posición de soltar está arriba o abajo del target
        const rect = target.getBoundingClientRect();
        const mouseY = e.clientY;
        const middleY = rect.top + (rect.height / 2);

        if (mouseY < middleY) {
            target.classList.add('drop-zone-above');
        } else {
            target.classList.add('drop-zone-below');
        }
    }
}

/**
 * Lógica de Drag & Drop: El elemento arrastrado sale de un destino de soltar.
 */
function handleDragLeave(e) {
    const target = e.target.closest('tr');
    if (target) {
        target.classList.remove('drop-zone-above', 'drop-zone-below');
    }
}

/**
 * Lógica de Drag & Drop: Soltar el elemento.
 */
function handleDrop(e) {
    e.preventDefault();
    const target = e.target.closest('tr');
    if (target && target !== draggedItem) {
        const fromIndex = parseInt(draggedItem.dataset.index);
        const toIndex = parseInt(target.dataset.index);
        
        // Determinar la posición de inserción
        const rect = target.getBoundingClientRect();
        const mouseY = e.clientY;
        const middleY = rect.top + (rect.height / 2);
        
        let newIndex = toIndex;
        if (mouseY > middleY) {
            // Soltar debajo del target
            newIndex = toIndex + 1;
        }

        // Mover el elemento en el array de datos
        const [movedItem] = routeData.splice(fromIndex, 1);
        routeData.splice(newIndex > fromIndex ? newIndex - 1 : newIndex, 0, movedItem);

        // Después de mover por arrastre, reinicializar el orden manual del paciente movido a 0
        // y reordenar toda la lista por el nuevo orden de arrastre.
        movedItem.manualOrder = 0; 
        
        // Recalcular los tiempos y re-renderizar para reflejar el nuevo orden
        calculateEstimatedTimes(0);
        renderRouteTable();

        showMessage(`Paciente movido por arrastre a la posición ${movedItem.numSecuencia}.`, 'success');
    }
    handleDragEnd(); // Asegurar que la limpieza se haga incluso si se soltó fuera
}

/**
 * Lógica de Drag & Drop: Fin del arrastre (limpieza).
 */
function handleDragEnd() {
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
    }
    // Limpiar clases de drop en todas las filas
    Array.from(DOM.routeTableBody.children).forEach(row => {
        row.classList.remove('drop-zone-above', 'drop-zone-below');
    });
}


// --------------------------------------
// Funciones de Archivos (CSV y PDF)
// --------------------------------------

/**
 * Procesa el archivo CSV cargado.
 */
function processCSV(file) {
    DOM.loadingOverlay.classList.remove('hidden');

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            csvHeaders = results.meta.fields;
            routeData = results.data.map((row, index) => {
                // ======================================
                // CAMBIO 4: CORRECCIÓN FSFB - Usar .trim() al cargar
                // (Asigna el resaltado azul si es FSFB al cargar el CSV)
                // ======================================
                const isFSFB = (row[COMPANIA_FIELD] || '').trim().toUpperCase().includes('FSFB');
                
                return {
                    ...row,
                    estimatedTime: DEFAULT_START_TIME,
                    numSecuencia: index + 1,
                    manualHighlight: 0,
                    manualOrder: 0, 
                    observaciones: '', // Observación seleccionada (dropdown)
                    observacionManual: '', // Observación escrita (input)
                    cellHighlightTipo: isFSFB ? 'blue' : '', // Resaltado automático para FSFB
                    cellHighlightSolicitud: '', 
                    cellHighlightObservaciones: ''
                };
            });

            sortRouteData(); 
            calculateEstimatedTimes(0); 
            renderRouteTable();
            DOM.exportPdfBtn.disabled = false;
            
            DOM.loadingOverlay.classList.add('hidden');
            showMessage(`Archivo CSV cargado exitosamente. ${routeData.length} pacientes encontrados.`, 'success');
        },
        error: (error) => {
            console.error('Error al parsear CSV:', error);
            DOM.loadingOverlay.classList.add('hidden');
            showMessage(`Error al cargar el archivo: ${error.message}`, 'error');
        }
    });
}

/**
 * Exporta la tabla actual como un archivo PDF.
 */
function exportToPDF() {
    if (routeData.length === 0) {
        showMessage('No hay datos para exportar.', 'warning');
        return;
    }

    DOM.loadingOverlay.classList.remove('hidden');

    const doc = new jsPDF({
        orientation: 'landscape', 
        unit: 'mm',
        format: 'a4'
    });

    const tableColumn = [
        "N°", 
        "Orden Manual", 
        "Hora Est.", 
        "Nombre Paciente", 
        "Documento", 
        "Solicitud", 
        "Tipo Cliente", 
        "Dirección y Teléfono",
        "Observaciones"
    ];
    const tableRows = [];
    // INCLUSIÓN: Inicializar arrays para los estilos de color en el PDF
    const rowStyles = []; 
    const cellStyles = []; 

    routeData.forEach(item => {
        // Combinar observaciones: seleccionada + manual (si existe)
        const combinedObs = [item.observaciones, item.observacionManual]
            .filter(text => text.trim() !== '')
            .join(' | ');

        const rowData = [
            item.numSecuencia,
            item.manualOrder || '-',
            item.estimatedTime,
            item['Nombre Paciente'] || '',
            item['N° Documento'] || '',
            item[SOLICITUD_FIELD] || '',
            item[COMPANIA_FIELD] || '',
            item[RAW_ADDRESS_FIELD] || '',
            combinedObs
        ];
        tableRows.push(rowData);
        
        // Color de Fondo de Fila (Orden Manual) - Utiliza PDF_HIGHLIGHT_COLORS actualizados
        rowStyles.push(PDF_HIGHLIGHT_COLORS[item.manualHighlight] || [255, 255, 255]); 

        // Colores de Fondo de Celdas (Índice de columna)
        cellStyles.push({
            6: PDF_CELL_HIGHLIGHT_COLORS[item.cellHighlightTipo], // Tipo Cliente (Índice 6)
            5: PDF_CELL_HIGHLIGHT_COLORS[item.cellHighlightSolicitud], // Solicitud (Índice 5)
            8: PDF_CELL_HIGHLIGHT_COLORS[item.cellHighlightObservaciones], // Observaciones (Índice 8)
        });
    });
    
    doc.autoTable(tableColumn, tableRows, {
        startY: 60,
        headStyles: { 
            fillColor: [79, 70, 229],
            textColor: [255, 255, 255], 
            fontStyle: 'bold' 
        },
        styles: { 
            fontSize: 8, 
            cellPadding: 2, 
            overflow: 'linebreak',
            valign: 'top' // Cambiado a top para mejor alineación en observaciones
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' }, // N°
            1: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, // Orden Manual
            2: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, // Hora Est.
            3: { cellWidth: 25 }, // Nombre
            4: { cellWidth: 15 }, // Documento
            5: { cellWidth: 15 }, // Solicitud
            6: { cellWidth: 15 }, // Tipo Cliente
            7: { cellWidth: 50 }, // Dirección
            8: { cellWidth: 35 } // Observaciones
        },
        didDrawPage: function (data) {
            // Título de la cabecera
            doc.setFontSize(18);
            doc.setTextColor(79, 70, 229);
            doc.text('Ruta de Visitas de Laboratorio Organizada', data.settings.margin.left, 40);
            
            doc.setFontSize(10);
            doc.setTextColor(107, 114, 128);
            doc.text(`Fecha de Exportación: ${new Date().toLocaleDateString('es-CO')}`, data.settings.margin.left, 55);
        },
        // Aplicar estilos de fila y celda personalizados (para colores de resaltado)
        willDrawCell: function (data) {
            if (data.section === 'body') {
                const rowIndex = data.row.index;
                const colIndex = data.column.index;

                // 1. Color de Fondo de Fila (Orden Manual)
                data.cell.styles.fillColor = rowStyles[rowIndex];

                // 2. Color de Fondo de Celdas Específicas
                const cellColor = cellStyles[rowIndex][colIndex];
                if (cellColor) {
                    data.cell.styles.fillColor = cellColor; // Sobreescribe el color de fila
                }
            }
        }
    });

    doc.save(`ruta_lab_pdf_${new Date().toISOString().slice(0, 10)}.pdf`);
    DOM.loadingOverlay.classList.add('hidden');
    showMessage('Ruta exportada como PDF con éxito.', 'success');
}

/**
 * Crea el texto de la ruta para los enlaces de mapas (Google Maps y Lupap).
 */
function createRouteText() {
    if (routeData.length === 0) return '';

    const addresses = routeData
        .map(row => row[RAW_ADDRESS_FIELD].replace(/[\n\r]+/g, ' '))
        .filter(addr => addr.trim() !== '');

    return addresses.join('|');
}

/**
 * Actualiza los enlaces de mapas con la ruta actual.
 */
function updateMapLinks() {
    const routeText = createRouteText();
    if (routeText) {
        const encodedRoute = encodeURIComponent(routeText);
        
        DOM.googleMapsLink.href = `https://www.google.com/maps/search/?api=1&query=$${encodedRoute}`;
        
        DOM.lupapLink.href = `https://www.lupap.com.co/home/mapa-ruta?direccion=${encodedRoute.replace(/%7C/g, ',')}`;
    } else {
        DOM.googleMapsLink.classList.remove('show');
        DOM.lupapLink.classList.remove('show');
    }
}


// --------------------------------------
// Funciones de Modal (Reemplazo de alert/confirm)
// --------------------------------------

/**
 * Muestra un modal de confirmación personalizado.
 */
function showCustomModal(message, onConfirm) {
    if (DOM.customModal.classList.contains('show')) return; // Evitar múltiples modales

    DOM.customModal.classList.remove('hidden');
    
    // Contenido del modal
    DOM.customModal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-auto transform transition-all sm:my-8 sm:align-middle sm:w-full">
            <div class="text-center">
                <h3 class="text-lg leading-6 font-medium text-gray-900">Confirmación</h3>
                <div class="mt-2">
                    <p class="text-sm text-gray-500">${message}</p>
                </div>
            </div>
            <div class="mt-5 sm:mt-6 flex justify-end space-x-3">
                <button id="modal-cancel-btn" type="button" class="action-btn bg-gray-200 text-gray-700 hover:bg-gray-300 min-w-0">
                    Cancelar
                </button>
                <button id="modal-confirm-btn" type="button" class="action-btn bg-red-600 text-white hover:bg-red-700 min-w-0">
                    Confirmar
                </button>
            </div>
        </div>
    `;

    const removeModal = () => DOM.customModal.classList.add('hidden');
    
    document.getElementById('modal-confirm-btn').onclick = () => {
        onConfirm();
        removeModal();
    };
    document.getElementById('modal-cancel-btn').onclick = removeModal;
}


// --------------------------------------
// Event Listeners y Inicialización
// --------------------------------------

function init() {
    loadRouteFromLocalStorage();
    
    if (!DOM.startTimeInput.value) {
        DOM.startTimeInput.value = DEFAULT_START_TIME;
    }

    // Recalcular, ordenar y renderizar al cambiar la hora de inicio
    DOM.startTimeInput.addEventListener('change', () => {
        // Al cambiar la hora, el orden manual se mantiene y la hora estimadas se recalculan
        calculateEstimatedTimes(0);
        sortRouteData(); // Reordenar para que la hora recalculada tenga efecto de desempate
        renderRouteTable();
        showMessage('Hora de inicio actualizada. Ruta reordenada y tiempos recalculados.', 'info');
    });

    // Eventos de botones
    DOM.loadFileBtn.addEventListener('click', () => DOM.fileUpload.click());
    DOM.fileUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processCSV(e.target.files[0]);
            e.target.value = ''; // Limpiar el input file
        }
    });
    DOM.exportPdfBtn.addEventListener('click', exportToPDF);
    DOM.clearDataBtn.addEventListener('click', () => {
        showCustomModal('¿Está seguro de eliminar todos los datos de la ruta y el almacenamiento local?', () => {
            routeData = [];
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            renderRouteTable();
            showMessage('Datos de la ruta limpiados con éxito.', 'warning');
        });
    });
    
    // INCLUSIÓN: Evento para el botón de Volver al Portal
    DOM.portalLinkBtn.addEventListener('click', () => {
        window.open('https://rmns82839-rgb.github.io/portal-de-toma-de-muestras/', '_self'); // '_self' para abrir en la misma pestaña
    });
}

// Inicializar la aplicación al cargar la ventana
window.onload = init;