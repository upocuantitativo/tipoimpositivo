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
function actualizarMapa(data) {
    const ccaaData = data.detalle_ccaa;
    if (!ccaaData || typeof SPAIN_CCAA_PATHS === 'undefined') return;

    const container = document.getElementById('mapa-espana');
    if (!container) return;

    // Calcular diferencias y escala de color
    let maxDiff = 0;
    const diffMap = {};
    ccaaData.forEach(c => {
        const diff = c.recaudacion_nueva - c.recaudacion_actual;
        diffMap[c.id] = {
            diff,
            cuotaDiff: c.cuota_media_nueva - c.cuota_media_actual,
            nombre: c.nombre,
            declarantes: c.declarantes
        };
        if (c.declarantes > 0) maxDiff = Math.max(maxDiff, Math.abs(diff));
    });
    if (maxDiff === 0) maxDiff = 1;

    let svg = `<svg viewBox="0 20 570 500" width="100%" xmlns="http://www.w3.org/2000/svg"
                style="font-family:'Source Sans 3','Segoe UI',sans-serif;">`;

    // Fondo mar
    svg += `<rect x="0" y="20" width="570" height="500" fill="#f0f4f8" rx="8"/>`;

    // Dibujar cada CCAA como polígono
    for (const [id, geo] of Object.entries(SPAIN_CCAA_PATHS)) {
        const info = diffMap[id];
        let fill = '#d5cfc5'; // régimen foral por defecto
        let strokeColor = '#fff';
        let textColor = '#666';

        if (info && info.declarantes > 0) {
            const ratio = info.diff / maxDiff;
            if (ratio > 0.02) {
                // Verde: más recaudación
                const t = Math.min(Math.abs(ratio), 1);
                const r = Math.round(230 - t * 185);  // 230 -> 45
                const g = Math.round(230 - t * 84);   // 230 -> 146
                const b = Math.round(230 - t * 151);   // 230 -> 79
                fill = `rgb(${r},${g},${b})`;
                textColor = t > 0.4 ? '#fff' : '#1b2a4a';
            } else if (ratio < -0.02) {
                // Rojo/burdeos: menos recaudación
                const t = Math.min(Math.abs(ratio), 1);
                const r = Math.round(230 - t * 91);   // 230 -> 139
                const g = Math.round(230 - t * 204);  // 230 -> 26
                const b = Math.round(230 - t * 187);  // 230 -> 43
                fill = `rgb(${r},${g},${b})`;
                textColor = t > 0.4 ? '#fff' : '#1b2a4a';
            } else {
                fill = '#e8e3db';
                textColor = '#555';
            }
            strokeColor = '#ffffffaa';
        }

        const tooltip = info
            ? `${info.nombre}: ${info.diff >= 0 ? '+' : ''}${fmtEur(info.diff)}\nCuota media: ${info.cuotaDiff >= 0 ? '+' : ''}${fmtEur(info.cuotaDiff)}`
            : geo.label;

        // Path del polígono
        svg += `<path d="${geo.path}" fill="${fill}" stroke="${strokeColor}" stroke-width="1.2"
                  stroke-linejoin="round" style="cursor:pointer;transition:opacity 0.15s;"
                  onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
                  <title>${tooltip}</title></path>`;

        // Etiqueta centrada
        const fontSize = ['CEU','MEL','RIO','CNT'].includes(id) ? 7
                        : ['MAD','MUR','PVA','BAL'].includes(id) ? 8
                        : ['AST','NAV','CAN'].includes(id) ? 8.5 : 9.5;
        svg += `<text x="${geo.cx}" y="${geo.cy}" text-anchor="middle" dominant-baseline="central"
                  fill="${textColor}" font-size="${fontSize}" font-weight="600"
                  style="pointer-events:none;text-shadow:0 0 3px rgba(255,255,255,0.5);">${geo.label}</text>`;
    }

    // Línea separadora para Canarias
    svg += `<line x1="5" y1="460" x2="210" y2="460" stroke="#d5cfc5" stroke-width="0.8" stroke-dasharray="4,3"/>`;
    svg += `<text x="108" y="470" text-anchor="middle" fill="#999" font-size="7" font-style="italic">Islas Canarias</text>`;

    svg += '</svg>';
    container.innerHTML = svg;

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
