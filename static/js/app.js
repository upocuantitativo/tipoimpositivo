/**
 * Simulador Fiscal IRPF/IS - España
 * Interfaz interactiva para analizar escenarios fiscales.
 * Datos: Panel de Hogares IEF 2020, AEAT, INE-DIRCE.
 */

// Estado global
let datosBase = null;
let tramosActuales = [];
let tipoIS = 25.0;
let charts = {};
let debounceTimer = null;
let tipoUnicoActivo = false;
let ultimoCcaaData = null; // Almacena datos CCAA para click handlers
let leafletMap = null;     // Instancia Leaflet
let geojsonLayer = null;   // Capa GeoJSON
let geojsonData = null;    // Datos GeoJSON cargados

// Mapa de nombre GeoJSON -> ID interno CCAA
const CCAA_NAME_TO_ID = {
    'Andalucia': 'AND', 'Aragon': 'ARA', 'Asturias': 'AST',
    'Baleares': 'BAL', 'Canarias': 'CAN', 'Cantabria': 'CNT',
    'Castilla-La Mancha': 'CLM', 'Castilla-Leon': 'CYL',
    'Cataluña': 'CAT', 'Valencia': 'VAL', 'Extremadura': 'EXT',
    'Galicia': 'GAL', 'Madrid': 'MAD', 'Murcia': 'MUR',
    'Navarra': 'NAV', 'Pais Vasco': 'PVA', 'La Rioja': 'RIO',
    'Ceuta': 'CEU', 'Melilla': 'MEL'
};

// Colores
const COLORS = {
    actual: 'rgba(27, 42, 74, 0.85)',
    nuevo: 'rgba(15, 52, 96, 0.7)',
    accent: 'rgba(139, 26, 43, 0.8)',
    success: 'rgba(45, 106, 79, 0.8)',
    palette: [
        'rgba(27, 42, 74, 0.8)',
        'rgba(139, 26, 43, 0.8)',
        'rgba(45, 106, 79, 0.8)',
        'rgba(199, 166, 59, 0.8)',
        'rgba(13, 202, 240, 0.7)',
        'rgba(108, 117, 125, 0.7)',
    ],
};

// El mapa de CCAA con polígonos reales se carga desde spain_ccaa.js (SPAIN_CCAA_PATHS)

function fmtEur(val) {
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + ' Md€';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + ' M€';
    return val.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
}
function fmtPct(val) { return val.toFixed(2) + '%'; }
function fmtNum(val) { return val.toLocaleString('es-ES'); }

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
    const resp = await fetch('/api/datos_base');
    datosBase = await resp.json();

    tramosActuales = datosBase.tramos.map(t => ({
        limite: t.limite, tipo: t.tipo, nombre: t.nombre
    }));
    tipoIS = datosBase.tipo_is;

    initSliders();
    initTipoUnico();
    initCharts();
    simular();
});

// ===================== SLIDERS =====================
function initSliders() {
    document.querySelectorAll('.tramo-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            if (tipoUnicoActivo) return;
            const idx = parseInt(e.target.dataset.index);
            const val = parseFloat(e.target.value);
            tramosActuales[idx].tipo = val;
            document.querySelector(`.tramo-input[data-index="${idx}"]`).value = val;
            debouncedSimular();
        });
    });

    document.querySelectorAll('.tramo-input').forEach(input => {
        input.addEventListener('change', (e) => {
            if (tipoUnicoActivo) return;
            const idx = parseInt(e.target.dataset.index);
            const val = parseFloat(e.target.value);
            tramosActuales[idx].tipo = val;
            document.querySelector(`.tramo-slider[data-index="${idx}"]`).value = val;
            debouncedSimular();
        });
    });

    document.getElementById('is-slider').addEventListener('input', (e) => {
        tipoIS = parseFloat(e.target.value);
        document.getElementById('is-input').value = tipoIS;
        debouncedSimular();
    });
    document.getElementById('is-input').addEventListener('change', (e) => {
        tipoIS = parseFloat(e.target.value);
        document.getElementById('is-slider').value = tipoIS;
        debouncedSimular();
    });
}

// ===================== TIPO ÚNICO =====================
function initTipoUnico() {
    const check = document.getElementById('tipo-unico-check');
    const control = document.getElementById('tipo-unico-control');
    const slider = document.getElementById('tipo-unico-slider');
    const input = document.getElementById('tipo-unico-input');

    check.addEventListener('change', () => {
        tipoUnicoActivo = check.checked;
        control.style.display = check.checked ? 'block' : 'none';
        if (check.checked) {
            aplicarTipoUnico(parseFloat(input.value));
        }
    });

    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        input.value = val;
        if (tipoUnicoActivo) aplicarTipoUnico(val);
    });

    input.addEventListener('change', () => {
        const val = parseFloat(input.value);
        slider.value = val;
        if (tipoUnicoActivo) aplicarTipoUnico(val);
    });
}

function aplicarTipoUnico(tipo) {
    tramosActuales.forEach((t, i) => {
        t.tipo = tipo;
        const sl = document.querySelector(`.tramo-slider[data-index="${i}"]`);
        const inp = document.querySelector(`.tramo-input[data-index="${i}"]`);
        if (sl) sl.value = tipo;
        if (inp) inp.value = tipo;
    });
    debouncedSimular();
}

// ===================== DEBOUNCE (100ms - rápido) =====================
function debouncedSimular() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(simular, 100);
}

// ===================== SIMULAR =====================
async function simular() {
    const body = { tramos: tramosActuales, tipo_is: tipoIS };
    const resp = await fetch('/api/simular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    actualizarMetricas(data);
    actualizarGraficos(data);
    actualizarTablas(data);
    actualizarMapa(data);
}

function actualizarMetricas(data) {
    const ea = data.escenario_actual;
    const en = data.escenario_nuevo;
    document.getElementById('metric-irpf-actual').textContent = fmtEur(ea.recaudacion_irpf);
    document.getElementById('metric-irpf-nuevo').textContent = fmtEur(en.recaudacion_irpf);
    document.getElementById('metric-is-actual').textContent = fmtEur(ea.recaudacion_is);
    document.getElementById('metric-is-nuevo').textContent = fmtEur(en.recaudacion_is);
    setDiffElement('metric-irpf-diff', data.diferencia_recaudacion_irpf);
    setDiffElement('metric-is-diff', data.diferencia_recaudacion_is);
}

function setDiffElement(id, diff) {
    const el = document.getElementById(id);
    const sign = diff >= 0 ? '+' : '';
    el.textContent = sign + fmtEur(diff);
    el.className = 'metric-sub ' + (diff > 0 ? 'positive' : diff < 0 ? 'negative' : '');
}

// ===================== CHARTS =====================
function initCharts() {
    Chart.defaults.font.family = "'Source Sans 3', 'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    // Transición suave desde posición actual (no crecer desde 0)
    Chart.defaults.animation = { duration: 350, easing: 'easeOutQuart' };
    Chart.defaults.transitions = {
        active: { animation: { duration: 250 } }
    };

    const barOpts = (yCb) => ({
        responsive: true,
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: { y: { ticks: { callback: yCb } } }
    });

    charts.recaudacionIRPF = new Chart(document.getElementById('chart-recaudacion-irpf'),
        { type: 'bar', data: { labels: [], datasets: [] }, options: barOpts(v => fmtEur(v)) });

    charts.recaudacionIS = new Chart(document.getElementById('chart-recaudacion-is'), {
        type: 'doughnut', data: { labels: [], datasets: [] },
        options: { responsive: true, plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 } } },
            tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmtEur(ctx.raw) } }
        }}
    });

    charts.comparativaTotal = new Chart(document.getElementById('chart-comparativa-total'), {
        type: 'bar', data: { labels: [], datasets: [] },
        options: { indexAxis: 'y', responsive: true,
            plugins: { legend: { display: true, position: 'bottom' } },
            scales: { x: { ticks: { callback: v => fmtEur(v) } } }
        }
    });

    charts.tipoEfectivo = new Chart(document.getElementById('chart-tipo-efectivo'),
        { type: 'bar', data: { labels: [], datasets: [] },
          options: barOpts(v => v + '%') });

    charts.cuotaCiudadanos = new Chart(document.getElementById('chart-cuota-ciudadanos'),
        { type: 'bar', data: { labels: [], datasets: [] }, options: barOpts(v => fmtEur(v)) });

    charts.costeEmpresas = new Chart(document.getElementById('chart-coste-empresas'),
        { type: 'bar', data: { labels: [], datasets: [] }, options: barOpts(v => fmtEur(v)) });

    charts.beneficioNeto = new Chart(document.getElementById('chart-beneficio-neto'),
        { type: 'bar', data: { labels: [], datasets: [] }, options: barOpts(v => fmtEur(v)) });

    charts.curvaTipo = new Chart(document.getElementById('chart-curva-tipo'), {
        type: 'line', data: { labels: [], datasets: [] },
        options: { responsive: true, plugins: { legend: { display: true, position: 'bottom' } },
            scales: { y: { ticks: { callback: v => v + '%' }, beginAtZero: true },
                      x: { ticks: { callback: v => fmtEur(v) } } }
        }
    });

    charts.recaudacionGrupo = new Chart(document.getElementById('chart-recaudacion-grupo'),
        { type: 'bar', data: { labels: [], datasets: [] }, options: barOpts(v => fmtEur(v)) });
}

function actualizarGraficos(data) {
    const ea = data.escenario_actual;
    const en = data.escenario_nuevo;

    const labelsIRPF = ea.detalle_irpf.map(g => g.grupo.replace(/\(.*\)/, '').trim());
    charts.recaudacionIRPF.data = { labels: labelsIRPF, datasets: [
        { label: 'Actual', data: ea.detalle_irpf.map(g => g.recaudacion_total), backgroundColor: COLORS.actual },
        { label: 'Simulado', data: en.detalle_irpf.map(g => g.recaudacion_total), backgroundColor: COLORS.nuevo }
    ]}; charts.recaudacionIRPF.update();

    charts.recaudacionIS.data = { labels: en.detalle_is.map(e => e.tipo_empresa.split('(')[0].trim()),
        datasets: [{ data: en.detalle_is.map(e => e.recaudacion_total), backgroundColor: COLORS.palette }]
    }; charts.recaudacionIS.update();

    charts.comparativaTotal.data = { labels: ['IRPF', 'Imp. Sociedades', 'Total'], datasets: [
        { label: 'Actual', data: [ea.recaudacion_irpf, ea.recaudacion_is, ea.recaudacion_irpf + ea.recaudacion_is], backgroundColor: COLORS.actual },
        { label: 'Simulado', data: [en.recaudacion_irpf, en.recaudacion_is, en.recaudacion_irpf + en.recaudacion_is], backgroundColor: COLORS.nuevo }
    ]}; charts.comparativaTotal.update();

    const dc = data.diferencias_ciudadanos;
    charts.tipoEfectivo.data = { labels: dc.map(c => c.nombre), datasets: [
        { label: 'Tipo ef. actual', data: dc.map(c => c.tipo_efectivo_actual), backgroundColor: COLORS.actual },
        { label: 'Tipo ef. nuevo', data: dc.map(c => c.tipo_efectivo_nuevo), backgroundColor: COLORS.nuevo }
    ]}; charts.tipoEfectivo.update();

    charts.cuotaCiudadanos.data = { labels: dc.map(c => c.nombre), datasets: [
        { label: 'Cuota actual', data: dc.map(c => c.cuota_actual), backgroundColor: COLORS.actual },
        { label: 'Cuota nueva', data: dc.map(c => c.cuota_nueva), backgroundColor: COLORS.nuevo }
    ]}; charts.cuotaCiudadanos.update();

    const de = data.diferencias_empresas;
    charts.costeEmpresas.data = { labels: de.map(e => e.tipo_empresa.split('(')[0].trim()), datasets: [
        { label: 'Cuota IS actual', data: de.map(e => e.cuota_actual), backgroundColor: COLORS.actual },
        { label: 'Cuota IS nueva', data: de.map(e => e.cuota_nueva), backgroundColor: COLORS.nuevo }
    ]}; charts.costeEmpresas.update();

    charts.beneficioNeto.data = { labels: en.detalle_is.map(e => e.tipo_empresa.split('(')[0].trim()),
        datasets: [{ label: 'Beneficio neto (tras IS)', data: en.detalle_is.map(e => e.beneficio_neto), backgroundColor: COLORS.palette }]
    }; charts.beneficioNeto.update();

    const rentas = [5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 80000, 100000, 150000, 200000, 300000, 500000];
    const tiposActual = rentas.map(r => calcTipoEfectivoLocal(r, datosBase.tramos));
    const tiposNuevo = rentas.map(r => calcTipoEfectivoLocal(r, tramosActuales));
    charts.curvaTipo.data = { labels: rentas, datasets: [
        { label: 'Tipo efectivo actual', data: tiposActual, borderColor: COLORS.actual, backgroundColor: 'transparent', tension: 0.3, borderWidth: 2, pointRadius: 3 },
        { label: 'Tipo efectivo nuevo', data: tiposNuevo, borderColor: COLORS.accent, backgroundColor: 'transparent', tension: 0.3, borderWidth: 2, pointRadius: 3 }
    ]}; charts.curvaTipo.update();

    charts.recaudacionGrupo.data = { labels: labelsIRPF, datasets: [
        { label: 'Actual', data: ea.detalle_irpf.map(g => g.recaudacion_total), backgroundColor: COLORS.actual },
        { label: 'Simulado', data: en.detalle_irpf.map(g => g.recaudacion_total), backgroundColor: COLORS.accent }
    ]}; charts.recaudacionGrupo.update();
}

function calcTipoEfectivoLocal(renta, tramos) {
    const minPersonal = 5550;
    let baseLiq = Math.max(0, renta - minPersonal);
    let cuota = 0, limAnt = 0;
    for (const t of tramos) {
        const lim = t.limite === 'Infinity' ? Infinity : parseFloat(t.limite);
        const ancho = lim - limAnt;
        const enTramo = Math.min(baseLiq, ancho);
        if (enTramo <= 0) { limAnt = lim; continue; }
        cuota += enTramo * (t.tipo / 100);
        baseLiq -= enTramo;
        limAnt = lim;
    }
    return renta > 0 ? Math.round(cuota / renta * 10000) / 100 : 0;
}

// ===================== TABLAS =====================
function actualizarTablas(data) {
    const ea = data.escenario_actual;
    const en = data.escenario_nuevo;

    document.querySelector('#tabla-ciudadanos tbody').innerHTML = data.diferencias_ciudadanos.map(c => {
        const dc = c.diferencia > 0 ? 'diff-positive' : c.diferencia < 0 ? 'diff-negative' : 'diff-zero';
        const s = c.diferencia >= 0 ? '+' : '';
        return `<tr><td><strong>${c.nombre}</strong></td><td class="text-end">${fmtEur(c.renta_bruta)}</td>
            <td class="text-end">${fmtEur(c.cuota_actual)}</td><td class="text-end">${fmtEur(c.cuota_nueva)}</td>
            <td class="text-end ${dc}">${s}${fmtEur(c.diferencia)}</td>
            <td class="text-end">${fmtPct(c.tipo_efectivo_actual)}</td><td class="text-end">${fmtPct(c.tipo_efectivo_nuevo)}</td></tr>`;
    }).join('');

    document.querySelector('#tabla-empresas tbody').innerHTML = data.diferencias_empresas.map((e, i) => {
        const dc = e.diferencia > 0 ? 'diff-positive' : e.diferencia < 0 ? 'diff-negative' : 'diff-zero';
        const s = e.diferencia >= 0 ? '+' : '';
        return `<tr><td><strong>${e.tipo_empresa}</strong></td><td class="text-end">${fmtNum(en.detalle_is[i].num_empresas)}</td>
            <td class="text-end">${fmtEur(en.detalle_is[i].beneficio_medio)}</td>
            <td class="text-end">${fmtEur(e.cuota_actual)}</td><td class="text-end">${fmtEur(e.cuota_nueva)}</td>
            <td class="text-end ${dc}">${s}${fmtEur(e.diferencia)}</td>
            <td class="text-end">${fmtEur(en.detalle_is[i].coste_ss_total)}</td>
            <td class="text-end">${fmtEur(en.detalle_is[i].recaudacion_total)}</td></tr>`;
    }).join('');

    document.querySelector('#tabla-comparativa tbody').innerHTML = ea.detalle_irpf.map((g, i) => {
        const gn = en.detalle_irpf[i];
        const diff = gn.recaudacion_total - g.recaudacion_total;
        const diffPct = g.recaudacion_total > 0 ? (diff / g.recaudacion_total * 100) : 0;
        const dc = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff-negative' : 'diff-zero';
        const s = diff >= 0 ? '+' : '';
        return `<tr><td><strong>${g.grupo}</strong></td><td class="text-end">${fmtNum(g.declarantes)}</td>
            <td class="text-end">${fmtEur(g.renta_media)}</td><td class="text-end">${fmtEur(g.recaudacion_total)}</td>
            <td class="text-end">${fmtEur(gn.recaudacion_total)}</td>
            <td class="text-end ${dc}">${s}${fmtEur(diff)}</td><td class="text-end ${dc}">${s}${diffPct.toFixed(1)}%</td></tr>`;
    }).join('');
}

// ===================== MAPA CCAA (polígonos reales) =====================
function mostrarDetalleCCAA(id) {
    if (!ultimoCcaaData) return;
    const c = ultimoCcaaData.find(x => x.id === id);
    if (!c || c.declarantes === 0) return;

    const diffCuota = c.cuota_media_nueva - c.cuota_media_actual;
    const diffRec = c.recaudacion_nueva - c.recaudacion_actual;
    const tipoEfActual = c.renta_media > 0 ? (c.cuota_media_actual / c.renta_media * 100) : 0;
    const tipoEfNuevo = c.renta_media > 0 ? (c.cuota_media_nueva / c.renta_media * 100) : 0;
    const colorDiff = diffRec > 0 ? '#2d6a4f' : diffRec < 0 ? '#8b1a2b' : '#555';

    document.getElementById('ccaa-detalle-titulo').textContent = c.nombre;
    document.getElementById('ccaa-detalle-contenido').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;">
            <div><strong>Declarantes:</strong> ${c.declarantes.toLocaleString('es-ES')}</div>
            <div><strong>Renta media:</strong> ${fmtEur(c.renta_media)}</div>
            <div><strong>Diferencial autonómico:</strong> ${c.diferencial_autonomico >= 0 ? '+' : ''}${c.diferencial_autonomico} p.p.</div>
            <div>&nbsp;</div>
            <div style="border-top:1px solid #e8e3db;padding-top:0.4rem;"><strong>Cuota media actual:</strong> ${fmtEur(c.cuota_media_actual)}</div>
            <div style="border-top:1px solid #e8e3db;padding-top:0.4rem;"><strong>Cuota media simulada:</strong> ${fmtEur(c.cuota_media_nueva)}</div>
            <div><strong>Tipo efectivo actual:</strong> ${tipoEfActual.toFixed(1)}%</div>
            <div><strong>Tipo efectivo simulado:</strong> ${tipoEfNuevo.toFixed(1)}%</div>
            <div><strong>Recaudación actual:</strong> ${fmtEur(c.recaudacion_actual)}</div>
            <div><strong>Recaudación simulada:</strong> ${fmtEur(c.recaudacion_nueva)}</div>
        </div>
        <div style="margin-top:0.6rem;padding-top:0.4rem;border-top:1px solid #e8e3db;">
            <strong style="color:${colorDiff};">Diferencia recaudación: ${diffRec >= 0 ? '+' : ''}${fmtEur(diffRec)}</strong>
            &nbsp;|&nbsp;
            <strong style="color:${colorDiff};">Diferencia cuota media: ${diffCuota >= 0 ? '+' : ''}${fmtEur(diffCuota)}</strong>
        </div>`;
    document.getElementById('ccaa-detalle').style.display = 'block';
}

function getColorForDiff(ratio) {
    if (ratio > 0.02) {
        const t = Math.min(Math.abs(ratio), 1);
        const r = Math.round(230 - t * 185);
        const g = Math.round(230 - t * 84);
        const b = Math.round(230 - t * 151);
        return `rgb(${r},${g},${b})`;
    } else if (ratio < -0.02) {
        const t = Math.min(Math.abs(ratio), 1);
        const r = Math.round(230 - t * 91);
        const g = Math.round(230 - t * 204);
        const b = Math.round(230 - t * 187);
        return `rgb(${r},${g},${b})`;
    }
    return '#e8e3db';
}

function initLeafletMap() {
    if (leafletMap) return;
    const container = document.getElementById('mapa-espana');
    if (!container) return;

    leafletMap = L.map('mapa-espana', {
        zoomControl: true,
        attributionControl: false,
        minZoom: 5,
        maxZoom: 8
    }).setView([39.5, -3.5], 6);

    // Fondo claro sin tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 8
    }).addTo(leafletMap);

    // Cargar GeoJSON
    fetch('/static/data/spain-ccaa.geojson')
        .then(r => r.json())
        .then(data => {
            geojsonData = data;
            geojsonLayer = L.geoJSON(data, {
                style: () => ({
                    fillColor: '#e8e3db',
                    weight: 1.5,
                    opacity: 1,
                    color: '#ffffff',
                    fillOpacity: 0.85,
                    className: 'ccaa-path'
                }),
                onEachFeature: (feature, layer) => {
                    const name = feature.properties.name;
                    const id = CCAA_NAME_TO_ID[name];
                    layer._ccaaId = id;
                    layer._ccaaName = name;

                    layer.on({
                        mouseover: (e) => {
                            e.target.setStyle({ weight: 3, color: '#1b2a4a', fillOpacity: 0.95 });
                            e.target.bringToFront();
                        },
                        mouseout: (e) => {
                            e.target.setStyle({ weight: 1.5, color: '#ffffff', fillOpacity: 0.85 });
                        },
                        click: () => {
                            if (id) mostrarDetalleCCAA(id);
                        }
                    });

                    // Tooltip con nombre
                    layer.bindTooltip(name, {
                        permanent: false,
                        direction: 'center',
                        className: 'ccaa-tooltip'
                    });
                }
            }).addTo(leafletMap);

            // Si ya hay datos de simulación, colorear
            if (ultimoCcaaData) colorearMapa();
        });
}

function colorearMapa() {
    if (!geojsonLayer || !ultimoCcaaData) return;

    const diffMap = {};
    let maxDiff = 0;
    ultimoCcaaData.forEach(c => {
        const diff = c.recaudacion_nueva - c.recaudacion_actual;
        diffMap[c.id] = { diff, declarantes: c.declarantes, nombre: c.nombre,
            cuotaDiff: c.cuota_media_nueva - c.cuota_media_actual };
        if (c.declarantes > 0) maxDiff = Math.max(maxDiff, Math.abs(diff));
    });
    if (maxDiff === 0) maxDiff = 1;

    geojsonLayer.eachLayer(layer => {
        const id = layer._ccaaId;
        const info = diffMap[id];
        let fillColor = '#d5cfc5'; // foral

        if (info && info.declarantes > 0) {
            const ratio = info.diff / maxDiff;
            fillColor = getColorForDiff(ratio);
        }

        layer.setStyle({ fillColor: fillColor });

        // Actualizar tooltip
        if (info && info.declarantes > 0) {
            const s = info.diff >= 0 ? '+' : '';
            layer.setTooltipContent(
                `<strong>${info.nombre}</strong><br>${s}${fmtEur(info.diff)}`
            );
        }
    });
}

function actualizarMapa(data) {
    const ccaaData = data.detalle_ccaa;
    if (!ccaaData) return;
    ultimoCcaaData = ccaaData;

    // Inicializar mapa Leaflet si no existe
    if (!leafletMap) {
        initLeafletMap();
    } else {
        colorearMapa();
    }

    // Actualizar detalle si estaba abierto
    const detalleDiv = document.getElementById('ccaa-detalle');
    if (detalleDiv && detalleDiv.style.display !== 'none') {
        const tituloActual = document.getElementById('ccaa-detalle-titulo').textContent;
        const ccaaAbierta = ccaaData.find(c => c.nombre === tituloActual);
        if (ccaaAbierta) mostrarDetalleCCAA(ccaaAbierta.id);
    }

    // Tabla de CCAA
    const tbody = document.querySelector('#tabla-ccaa tbody');
    if (tbody) {
        tbody.innerHTML = ccaaData
            .filter(c => c.declarantes > 0)
            .sort((a, b) => (b.recaudacion_nueva - b.recaudacion_actual) - (a.recaudacion_nueva - a.recaudacion_actual))
            .map(c => {
                const cuotaDiff = c.cuota_media_nueva - c.cuota_media_actual;
                const recDiff = c.recaudacion_nueva - c.recaudacion_actual;
                const dc = recDiff > 0 ? 'diff-positive' : recDiff < 0 ? 'diff-negative' : 'diff-zero';
                const s1 = cuotaDiff >= 0 ? '+' : '';
                const s2 = recDiff >= 0 ? '+' : '';
                return `<tr>
                    <td><strong>${c.nombre}</strong></td>
                    <td class="text-end ${dc}">${s1}${fmtEur(cuotaDiff)}</td>
                    <td class="text-end ${dc}">${s2}${fmtEur(recDiff)}</td>
                </tr>`;
            }).join('');
    }
}

// ===================== ESCENARIOS =====================
function cargarEscenario(nombre) {
    const escenarios = {
        actual: { tramos: [19.0, 24.0, 30.0, 37.0, 45.0, 47.0], is: 25.0 },
        plano20: { tramos: [20.0, 20.0, 20.0, 20.0, 20.0, 20.0], is: 20.0 },
        plano15: { tramos: [15.0, 15.0, 15.0, 15.0, 15.0, 15.0], is: 15.0 },
        progresivo_alto: { tramos: [15.0, 25.0, 35.0, 45.0, 52.0, 55.0], is: 30.0 },
        reducido_pyme: { tramos: [19.0, 24.0, 30.0, 37.0, 45.0, 47.0], is: 15.0 },
    };
    const esc = escenarios[nombre];
    if (!esc) return;

    // Desactivar tipo único si estaba activo
    const check = document.getElementById('tipo-unico-check');
    if (check.checked) {
        check.checked = false;
        tipoUnicoActivo = false;
        document.getElementById('tipo-unico-control').style.display = 'none';
    }

    esc.tramos.forEach((tipo, i) => {
        tramosActuales[i].tipo = tipo;
        const sl = document.querySelector(`.tramo-slider[data-index="${i}"]`);
        const inp = document.querySelector(`.tramo-input[data-index="${i}"]`);
        if (sl) sl.value = tipo;
        if (inp) inp.value = tipo;
    });
    tipoIS = esc.is;
    document.getElementById('is-slider').value = tipoIS;
    document.getElementById('is-input').value = tipoIS;
    simular();
}

// ===================== CÁLCULO INDIVIDUAL =====================
async function calcularIndividual() {
    const renta = parseFloat(document.getElementById('renta-individual').value) || 0;
    const resp = await fetch('/api/calcular_individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renta, tramos: tramosActuales })
    });
    const data = await resp.json();
    const div = document.getElementById('resultado-individual');
    const dc = data.diferencia > 0 ? 'diff-positive' : data.diferencia < 0 ? 'diff-negative' : 'diff-zero';
    const s = data.diferencia >= 0 ? '+' : '';
    div.innerHTML = `
        <div class="d-flex justify-content-between"><span>Cuota actual:</span><strong>${fmtEur(data.actual.cuota)}</strong></div>
        <div class="d-flex justify-content-between"><span>Cuota simulada:</span><strong class="text-primary">${fmtEur(data.nuevo.cuota)}</strong></div>
        <div class="d-flex justify-content-between"><span>Diferencia:</span><strong class="${dc}">${s}${fmtEur(data.diferencia)}</strong></div>
        <div class="d-flex justify-content-between"><span>Tipo ef. actual:</span><span>${fmtPct(data.actual.tipo_efectivo)}</span></div>
        <div class="d-flex justify-content-between"><span>Tipo ef. nuevo:</span><span>${fmtPct(data.nuevo.tipo_efectivo)}</span></div>`;
}

// ===================== SIMULACIÓN RL =====================
let rlChart = null;
let rlTramosChart = null;
let rlCompChart = null;
let rlMejorEscenario = null;
let rlRunning = false;

const TRAMOS_BASE = [19.0, 24.0, 30.0, 37.0, 45.0, 47.0];
const TRAMO_NOMBRES = ['0-12.450€', '12.450-20.200€', '20.200-35.200€', '35.200-60.000€', '60.000-300.000€', '>300.000€'];

function calcularRecompensa(resultado, objetivo) {
    const rec = resultado.recaudacion_total;
    const tipoEf = resultado.tipo_efectivo_medio;
    const prog = resultado.progresividad;
    const kakwani = resultado.kakwani || 0;
    // Referencia: recaudación actual ~218.000 M€
    const recNorm = rec / 218000;  // 1.0 = igual al actual

    switch (objetivo) {
        case 'max_recaudacion':
            return recNorm * 10;
        case 'min_carga_media':
            return -tipoEf * 0.5 + (recNorm > 0.5 ? recNorm * 2 : -20);
        case 'equilibrio':
            return recNorm * 4 + prog * 0.5 + kakwani * 0.05 - Math.abs(tipoEf - 20) * 0.1;
        case 'max_progresividad':
            // Maximizar la diferencia entre tipos efectivos alto/bajo + penalizar caída de recaudación
            return kakwani * 0.3 + prog * 1.5 + (recNorm > 0.7 ? recNorm * 2 : -10);
        default:
            return recNorm * 10;
    }
}

function generarAccion(estado, epsilon) {
    const accion = [...estado];
    if (Math.random() < epsilon) {
        // Exploración: cambio aleatorio en un tramo
        const idx = Math.floor(Math.random() * 6);
        const delta = (Math.random() - 0.5) * 10;  // ±5 p.p.
        accion[idx] = Math.max(1, Math.min(55, Math.round((accion[idx] + delta) * 2) / 2));
    } else {
        // Explotación: perturbación pequeña
        const idx = Math.floor(Math.random() * 6);
        const delta = (Math.random() - 0.5) * 4;  // ±2 p.p.
        accion[idx] = Math.max(1, Math.min(55, Math.round((accion[idx] + delta) * 2) / 2));
    }
    // Mantener progresividad: cada tramo >= anterior
    for (let i = 1; i < 6; i++) {
        if (accion[i] < accion[i - 1]) accion[i] = accion[i - 1];
    }
    return accion;
}

async function simularBatch(escenarios) {
    const resp = await fetch('/api/simular_batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escenarios: escenarios.map(t => ({ tramos: t, tipo_is: tipoIS })) })
    });
    const data = await resp.json();
    return data.resultados;
}

async function iniciarRL() {
    if (rlRunning) return;
    rlRunning = true;

    const btn = document.getElementById('btn-rl-iniciar');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Entrenando...';

    const episodios = parseInt(document.getElementById('rl-episodios').value) || 200;
    const alpha = parseFloat(document.getElementById('rl-alpha').value) || 0.15;
    const epsilonInicial = parseFloat(document.getElementById('rl-epsilon').value) || 0.3;
    const gamma = parseFloat(document.getElementById('rl-gamma').value) || 0.95;
    const objetivo = document.getElementById('rl-objetivo').value;

    document.getElementById('rl-progress-bar').style.display = 'block';
    document.getElementById('rl-status').textContent = 'Inicializando agente...';

    // Inicializar chart de recompensas
    const canvas = document.getElementById('chart-rl-reward');
    if (rlChart) rlChart.destroy();
    rlChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Recompensa episodio', data: [], borderColor: 'rgba(27,42,74,0.4)',
                  pointRadius: 1, borderWidth: 1, fill: false },
                { label: 'Mejor acumulada', data: [], borderColor: '#2d6a4f',
                  pointRadius: 0, borderWidth: 2.5, fill: false },
                { label: 'Media móvil (20)', data: [], borderColor: '#c7a63b',
                  pointRadius: 0, borderWidth: 2, borderDash: [4, 2], fill: false }
            ]
        },
        options: {
            responsive: true,
            animation: { duration: 0 },
            plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
            scales: { x: { title: { display: true, text: 'Episodio' } },
                      y: { title: { display: true, text: 'Recompensa' } } }
        }
    });

    // RL loop
    let estado = [...TRAMOS_BASE];
    let mejorReward = -Infinity;
    let mejorTramos = [...estado];
    let mejorResultado = null;
    const rewardHistory = [];
    const mejorHistory = [];
    const mediaHistory = [];
    const batchSize = 5;

    for (let ep = 0; ep < episodios; ep += batchSize) {
        const batchEnd = Math.min(ep + batchSize, episodios);
        const acciones = [];
        for (let b = ep; b < batchEnd; b++) {
            const epsilon = epsilonInicial * (1 - b / episodios);  // Decay
            acciones.push(generarAccion(estado, epsilon));
        }

        const resultados = await simularBatch(acciones);

        for (let b = 0; b < resultados.length; b++) {
            const reward = calcularRecompensa(resultados[b], objetivo);
            const rewardAnterior = rewardHistory.length > 0 ? rewardHistory[rewardHistory.length - 1] : 0;

            // Q-learning update del estado
            const delta = alpha * (reward + gamma * mejorReward - rewardAnterior);
            if (reward > mejorReward) {
                mejorReward = reward;
                mejorTramos = [...acciones[b]];
                mejorResultado = resultados[b];
                estado = [...acciones[b]];  // Mover al mejor estado
            } else if (Math.random() < 0.3) {
                // Ocasionalmente aceptar estados peores para diversificar
                estado = [...acciones[b]];
            }

            rewardHistory.push(reward);
            mejorHistory.push(mejorReward);

            // Media móvil
            const windowSize = 20;
            const start = Math.max(0, rewardHistory.length - windowSize);
            const slice = rewardHistory.slice(start);
            mediaHistory.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }

        // Actualizar gráfico
        rlChart.data.labels = rewardHistory.map((_, i) => i + 1);
        rlChart.data.datasets[0].data = [...rewardHistory];
        rlChart.data.datasets[1].data = [...mejorHistory];
        rlChart.data.datasets[2].data = [...mediaHistory];
        rlChart.update('none');

        // Progreso
        const pct = Math.round((batchEnd / episodios) * 100);
        document.getElementById('rl-progress').style.width = pct + '%';
        document.getElementById('rl-status').textContent =
            `Episodio ${batchEnd}/${episodios} — Mejor recompensa: ${mejorReward.toFixed(3)} — ε: ${(epsilonInicial * (1 - batchEnd / episodios)).toFixed(3)}`;

        // Yield para UI
        await new Promise(r => setTimeout(r, 10));
    }

    // Guardar resultado
    rlMejorEscenario = { tramos: mejorTramos, resultado: mejorResultado };
    mostrarResultadosRL(mejorTramos, mejorResultado, mejorReward);

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-play-fill"></i> Iniciar entrenamiento';
    document.getElementById('rl-status').textContent =
        `Entrenamiento completado — ${episodios} episodios — Mejor recompensa: ${mejorReward.toFixed(3)}`;
    rlRunning = false;
}

function mostrarResultadosRL(tramos, resultado, reward) {
    document.getElementById('rl-resultados').style.display = 'flex';
    document.getElementById('rl-resultados').classList.add('flex-wrap');
    document.getElementById('rl-mejor-reward').textContent = reward.toFixed(3);
    document.getElementById('rl-mejor-recaudacion').textContent = fmtEur(resultado.recaudacion_total);
    document.getElementById('rl-mejor-tipo-ef').textContent = resultado.tipo_efectivo_medio.toFixed(1) + '%';

    // Gráfico de tramos óptimos vs actuales
    const canvasT = document.getElementById('chart-rl-tramos');
    if (rlTramosChart) rlTramosChart.destroy();
    rlTramosChart = new Chart(canvasT, {
        type: 'bar',
        data: {
            labels: TRAMO_NOMBRES,
            datasets: [
                { label: 'Actual', data: TRAMOS_BASE, backgroundColor: 'rgba(27,42,74,0.7)' },
                { label: 'Óptimo RL', data: tramos, backgroundColor: 'rgba(45,106,79,0.7)' }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { title: { display: true, text: 'Tipo marginal (%)' }, beginAtZero: true } }
        }
    });

    // Gráfico comparativo de recaudación
    const canvasC = document.getElementById('chart-rl-comparativa');
    if (rlCompChart) rlCompChart.destroy();

    // Obtener recaudación actual para comparar
    const recActual = datosBase ? 86580 : 86580; // AEAT referencia
    rlCompChart = new Chart(canvasC, {
        type: 'bar',
        data: {
            labels: ['Recaudación IRPF', 'Recaudación IS', 'Total'],
            datasets: [
                { label: 'Actual', data: [86580, 26252, 86580 + 26252],
                  backgroundColor: 'rgba(27,42,74,0.7)' },
                { label: 'Óptimo RL', data: [resultado.recaudacion_irpf, resultado.recaudacion_is, resultado.recaudacion_total],
                  backgroundColor: 'rgba(45,106,79,0.7)' }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { ticks: { callback: v => fmtEur(v) } } }
        }
    });

    // Tabla
    const tbody = document.querySelector('#tabla-rl tbody');
    tbody.innerHTML = tramos.map((t, i) => {
        const diff = t - TRAMOS_BASE[i];
        const dc = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff-negative' : 'diff-zero';
        return `<tr>
            <td>${TRAMO_NOMBRES[i]}</td>
            <td class="text-end">${TRAMOS_BASE[i].toFixed(1)}%</td>
            <td class="text-end fw-bold">${t.toFixed(1)}%</td>
            <td class="text-end ${dc}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</td>
        </tr>`;
    }).join('');
}

function aplicarEscenarioRL() {
    if (!rlMejorEscenario) return;

    const check = document.getElementById('tipo-unico-check');
    if (check.checked) {
        check.checked = false;
        tipoUnicoActivo = false;
        document.getElementById('tipo-unico-control').style.display = 'none';
    }

    rlMejorEscenario.tramos.forEach((tipo, i) => {
        tramosActuales[i].tipo = tipo;
        const sl = document.querySelector(`.tramo-slider[data-index="${i}"]`);
        const inp = document.querySelector(`.tramo-input[data-index="${i}"]`);
        if (sl) sl.value = tipo;
        if (inp) inp.value = tipo;
    });
    simular();
}
