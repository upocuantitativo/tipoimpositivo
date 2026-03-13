/**
 * Simulador Fiscal IRPF/IS - España
 * Interfaz interactiva para analizar escenarios fiscales.
 */

// Estado global
let datosBase = null;
let tramosActuales = [];
let tipoIS = 25.0;
let charts = {};
let debounceTimer = null;

// Colores para gráficos
const COLORS = {
    actual: 'rgba(26, 26, 46, 0.8)',
    nuevo: 'rgba(15, 52, 96, 0.8)',
    accent: 'rgba(233, 69, 96, 0.8)',
    success: 'rgba(25, 135, 84, 0.8)',
    palette: [
        'rgba(15, 52, 96, 0.8)',
        'rgba(233, 69, 96, 0.8)',
        'rgba(25, 135, 84, 0.8)',
        'rgba(255, 193, 7, 0.8)',
        'rgba(13, 202, 240, 0.8)',
        'rgba(108, 117, 125, 0.8)',
    ],
    paletteBg: [
        'rgba(15, 52, 96, 0.2)',
        'rgba(233, 69, 96, 0.2)',
        'rgba(25, 135, 84, 0.2)',
        'rgba(255, 193, 7, 0.2)',
        'rgba(13, 202, 240, 0.2)',
        'rgba(108, 117, 125, 0.2)',
    ]
};

// Formato de moneda
function fmtEur(val) {
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + ' Md€';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + ' M€';
    return val.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
}

function fmtPct(val) {
    return val.toFixed(2) + '%';
}

function fmtNum(val) {
    return val.toLocaleString('es-ES');
}

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    const resp = await fetch('/api/datos_base');
    datosBase = await resp.json();

    tramosActuales = datosBase.tramos.map(t => ({
        limite: t.limite,
        tipo: t.tipo,
        nombre: t.nombre
    }));
    tipoIS = datosBase.tipo_is;

    initSliders();
    initCharts();
    simular();
});

function initSliders() {
    // Sliders IRPF
    document.querySelectorAll('.tramo-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            const val = parseFloat(e.target.value);
            tramosActuales[idx].tipo = val;
            document.querySelector(`.tramo-input[data-index="${idx}"]`).value = val;
            debouncedSimular();
        });
    });

    document.querySelectorAll('.tramo-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            const val = parseFloat(e.target.value);
            tramosActuales[idx].tipo = val;
            document.querySelector(`.tramo-slider[data-index="${idx}"]`).value = val;
            debouncedSimular();
        });
    });

    // Slider IS
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

function debouncedSimular() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(simular, 200);
}

async function simular() {
    const body = {
        tramos: tramosActuales,
        tipo_is: tipoIS
    };

    const resp = await fetch('/api/simular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await resp.json();
    actualizarMetricas(data);
    actualizarGraficos(data);
    actualizarTablas(data);
}

function actualizarMetricas(data) {
    const ea = data.escenario_actual;
    const en = data.escenario_nuevo;

    document.getElementById('metric-irpf-actual').textContent = fmtEur(ea.recaudacion_irpf);
    document.getElementById('metric-irpf-nuevo').textContent = fmtEur(en.recaudacion_irpf);
    document.getElementById('metric-is-actual').textContent = fmtEur(ea.recaudacion_is);
    document.getElementById('metric-is-nuevo').textContent = fmtEur(en.recaudacion_is);

    // Diferencias
    setDiffElement('metric-irpf-diff', data.diferencia_recaudacion_irpf);
    setDiffElement('metric-is-diff', data.diferencia_recaudacion_is);
}

function setDiffElement(id, diff) {
    const el = document.getElementById(id);
    const sign = diff >= 0 ? '+' : '';
    el.textContent = sign + fmtEur(diff);
    el.className = 'metric-sub ' + (diff > 0 ? 'positive' : diff < 0 ? 'negative' : '');
}

// Charts
function initCharts() {
    Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size = 11;

    charts.recaudacionIRPF = new Chart(
        document.getElementById('chart-recaudacion-irpf'),
        {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: v => fmtEur(v) } }
                }
            }
        }
    );

    charts.recaudacionIS = new Chart(
        document.getElementById('chart-recaudacion-is'),
        {
            type: 'doughnut',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10 } } },
                    tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmtEur(ctx.raw) } }
                }
            }
        }
    );

    charts.comparativaTotal = new Chart(
        document.getElementById('chart-comparativa-total'),
        {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    x: { ticks: { callback: v => fmtEur(v) } }
                }
            }
        }
    );

    charts.tipoEfectivo = new Chart(
        document.getElementById('chart-tipo-efectivo'),
        {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: v => v + '%' }, beginAtZero: true }
                }
            }
        }
    );

    charts.cuotaCiudadanos = new Chart(
        document.getElementById('chart-cuota-ciudadanos'),
        {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: v => fmtEur(v) } }
                }
            }
        }
    );

    charts.costeEmpresas = new Chart(
        document.getElementById('chart-coste-empresas'),
        {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: v => fmtEur(v) } }
                }
            }
        }
    );

    charts.beneficioNeto = new Chart(
        document.getElementById('chart-beneficio-neto'),
        {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: v => fmtEur(v) } }
                }
            }
        }
    );

    charts.curvaTipo = new Chart(
        document.getElementById('chart-curva-tipo'),
        {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: v => v + '%' }, beginAtZero: true },
                    x: { ticks: { callback: v => fmtEur(v) } }
                }
            }
        }
    );

    charts.recaudacionGrupo = new Chart(
        document.getElementById('chart-recaudacion-grupo'),
        {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: v => fmtEur(v) } }
                }
            }
        }
    );
}

function actualizarGraficos(data) {
    const ea = data.escenario_actual;
    const en = data.escenario_nuevo;

    // 1. Recaudación IRPF por grupo
    const labelsIRPF = ea.detalle_irpf.map(g => g.grupo.replace(/\(.*\)/, '').trim());
    charts.recaudacionIRPF.data = {
        labels: labelsIRPF,
        datasets: [
            {
                label: 'Actual',
                data: ea.detalle_irpf.map(g => g.recaudacion_total),
                backgroundColor: COLORS.actual,
            },
            {
                label: 'Simulado',
                data: en.detalle_irpf.map(g => g.recaudacion_total),
                backgroundColor: COLORS.nuevo,
            }
        ]
    };
    charts.recaudacionIRPF.update();

    // 2. Recaudación IS (doughnut del nuevo escenario)
    charts.recaudacionIS.data = {
        labels: en.detalle_is.map(e => e.tipo_empresa.split('(')[0].trim()),
        datasets: [{
            data: en.detalle_is.map(e => e.recaudacion_total),
            backgroundColor: COLORS.palette,
        }]
    };
    charts.recaudacionIS.update();

    // 3. Comparativa total
    charts.comparativaTotal.data = {
        labels: ['IRPF', 'Impuesto Sociedades', 'Total'],
        datasets: [
            {
                label: 'Actual',
                data: [ea.recaudacion_irpf, ea.recaudacion_is, ea.recaudacion_irpf + ea.recaudacion_is],
                backgroundColor: COLORS.actual,
            },
            {
                label: 'Simulado',
                data: [en.recaudacion_irpf, en.recaudacion_is, en.recaudacion_irpf + en.recaudacion_is],
                backgroundColor: COLORS.nuevo,
            }
        ]
    };
    charts.comparativaTotal.update();

    // 4. Tipo efectivo ciudadanos
    const dc = data.diferencias_ciudadanos;
    charts.tipoEfectivo.data = {
        labels: dc.map(c => c.nombre),
        datasets: [
            {
                label: 'Tipo ef. actual',
                data: dc.map(c => c.tipo_efectivo_actual),
                backgroundColor: COLORS.actual,
            },
            {
                label: 'Tipo ef. nuevo',
                data: dc.map(c => c.tipo_efectivo_nuevo),
                backgroundColor: COLORS.nuevo,
            }
        ]
    };
    charts.tipoEfectivo.update();

    // 5. Cuota ciudadanos
    charts.cuotaCiudadanos.data = {
        labels: dc.map(c => c.nombre),
        datasets: [
            {
                label: 'Cuota actual',
                data: dc.map(c => c.cuota_actual),
                backgroundColor: COLORS.actual,
            },
            {
                label: 'Cuota nueva',
                data: dc.map(c => c.cuota_nueva),
                backgroundColor: COLORS.nuevo,
            }
        ]
    };
    charts.cuotaCiudadanos.update();

    // 6. Coste empresas
    const de = data.diferencias_empresas;
    charts.costeEmpresas.data = {
        labels: de.map(e => e.tipo_empresa.split('(')[0].trim()),
        datasets: [
            {
                label: 'Cuota IS actual',
                data: de.map(e => e.cuota_actual),
                backgroundColor: COLORS.actual,
            },
            {
                label: 'Cuota IS nueva',
                data: de.map(e => e.cuota_nueva),
                backgroundColor: COLORS.nuevo,
            }
        ]
    };
    charts.costeEmpresas.update();

    // 7. Beneficio neto
    charts.beneficioNeto.data = {
        labels: en.detalle_is.map(e => e.tipo_empresa.split('(')[0].trim()),
        datasets: [{
            label: 'Beneficio neto (tras IS)',
            data: en.detalle_is.map(e => e.beneficio_neto),
            backgroundColor: COLORS.palette,
        }]
    };
    charts.beneficioNeto.update();

    // 8. Curva tipo efectivo
    const rentas = [5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 80000, 100000, 150000, 200000, 300000, 500000];
    // Calcular tipos efectivos para cada renta en ambos escenarios
    // Usamos cálculo local
    const tiposActual = rentas.map(r => calcTipoEfectivoLocal(r, datosBase.tramos));
    const tiposNuevo = rentas.map(r => calcTipoEfectivoLocal(r, tramosActuales));

    charts.curvaTipo.data = {
        labels: rentas,
        datasets: [
            {
                label: 'Tipo efectivo actual',
                data: tiposActual,
                borderColor: COLORS.actual,
                backgroundColor: 'transparent',
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 3,
            },
            {
                label: 'Tipo efectivo nuevo',
                data: tiposNuevo,
                borderColor: COLORS.accent,
                backgroundColor: 'transparent',
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 3,
            }
        ]
    };
    charts.curvaTipo.update();

    // 9. Recaudación por grupo
    charts.recaudacionGrupo.data = {
        labels: ea.detalle_irpf.map(g => g.grupo.replace(/\(.*\)/, '').trim()),
        datasets: [
            {
                label: 'Actual',
                data: ea.detalle_irpf.map(g => g.recaudacion_total),
                backgroundColor: COLORS.actual,
            },
            {
                label: 'Simulado',
                data: en.detalle_irpf.map(g => g.recaudacion_total),
                backgroundColor: COLORS.accent,
            }
        ]
    };
    charts.recaudacionGrupo.update();
}

function calcTipoEfectivoLocal(renta, tramos) {
    const minPersonal = 5550;
    let baseLiq = Math.max(0, renta - minPersonal);
    let cuota = 0;
    let limAnt = 0;

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

function actualizarTablas(data) {
    // Tabla ciudadanos
    const tbCiud = document.querySelector('#tabla-ciudadanos tbody');
    tbCiud.innerHTML = data.diferencias_ciudadanos.map(c => {
        const diffClass = c.diferencia > 0 ? 'diff-positive' : c.diferencia < 0 ? 'diff-negative' : 'diff-zero';
        const sign = c.diferencia >= 0 ? '+' : '';
        return `<tr>
            <td><strong>${c.nombre}</strong></td>
            <td class="text-end">${fmtEur(c.renta_bruta)}</td>
            <td class="text-end">${fmtEur(c.cuota_actual)}</td>
            <td class="text-end">${fmtEur(c.cuota_nueva)}</td>
            <td class="text-end ${diffClass}">${sign}${fmtEur(c.diferencia)}</td>
            <td class="text-end">${fmtPct(c.tipo_efectivo_actual)}</td>
            <td class="text-end">${fmtPct(c.tipo_efectivo_nuevo)}</td>
        </tr>`;
    }).join('');

    // Tabla empresas
    const tbEmp = document.querySelector('#tabla-empresas tbody');
    const ea = data.escenario_actual;
    const en = data.escenario_nuevo;
    tbEmp.innerHTML = data.diferencias_empresas.map((e, i) => {
        const diffClass = e.diferencia > 0 ? 'diff-positive' : e.diferencia < 0 ? 'diff-negative' : 'diff-zero';
        const sign = e.diferencia >= 0 ? '+' : '';
        return `<tr>
            <td><strong>${e.tipo_empresa}</strong></td>
            <td class="text-end">${fmtNum(en.detalle_is[i].num_empresas)}</td>
            <td class="text-end">${fmtEur(en.detalle_is[i].beneficio_medio)}</td>
            <td class="text-end">${fmtEur(e.cuota_actual)}</td>
            <td class="text-end">${fmtEur(e.cuota_nueva)}</td>
            <td class="text-end ${diffClass}">${sign}${fmtEur(e.diferencia)}</td>
            <td class="text-end">${fmtEur(en.detalle_is[i].coste_ss_total)}</td>
            <td class="text-end">${fmtEur(en.detalle_is[i].recaudacion_total)}</td>
        </tr>`;
    }).join('');

    // Tabla comparativa recaudación
    const tbComp = document.querySelector('#tabla-comparativa tbody');
    tbComp.innerHTML = ea.detalle_irpf.map((g, i) => {
        const gn = en.detalle_irpf[i];
        const diff = gn.recaudacion_total - g.recaudacion_total;
        const diffPct = g.recaudacion_total > 0 ? (diff / g.recaudacion_total * 100) : 0;
        const diffClass = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff-negative' : 'diff-zero';
        const sign = diff >= 0 ? '+' : '';
        return `<tr>
            <td><strong>${g.grupo}</strong></td>
            <td class="text-end">${fmtNum(g.declarantes)}</td>
            <td class="text-end">${fmtEur(g.renta_media)}</td>
            <td class="text-end">${fmtEur(g.recaudacion_total)}</td>
            <td class="text-end">${fmtEur(gn.recaudacion_total)}</td>
            <td class="text-end ${diffClass}">${sign}${fmtEur(diff)}</td>
            <td class="text-end ${diffClass}">${sign}${diffPct.toFixed(1)}%</td>
        </tr>`;
    }).join('');
}

// Escenarios predefinidos
function cargarEscenario(nombre) {
    const escenarios = {
        actual: {
            tramos: [19.0, 24.0, 30.0, 37.0, 45.0, 47.0],
            is: 25.0
        },
        plano20: {
            tramos: [20.0, 20.0, 20.0, 20.0, 20.0, 20.0],
            is: 20.0
        },
        plano15: {
            tramos: [15.0, 15.0, 15.0, 15.0, 15.0, 15.0],
            is: 15.0
        },
        progresivo_alto: {
            tramos: [15.0, 25.0, 35.0, 45.0, 52.0, 55.0],
            is: 30.0
        },
        reducido_pyme: {
            tramos: [19.0, 24.0, 30.0, 37.0, 45.0, 47.0],
            is: 15.0
        }
    };

    const esc = escenarios[nombre];
    if (!esc) return;

    esc.tramos.forEach((tipo, i) => {
        tramosActuales[i].tipo = tipo;
        const slider = document.querySelector(`.tramo-slider[data-index="${i}"]`);
        const input = document.querySelector(`.tramo-input[data-index="${i}"]`);
        if (slider) slider.value = tipo;
        if (input) input.value = tipo;
    });

    tipoIS = esc.is;
    document.getElementById('is-slider').value = tipoIS;
    document.getElementById('is-input').value = tipoIS;

    simular();
}

// Cálculo individual
async function calcularIndividual() {
    const renta = parseFloat(document.getElementById('renta-individual').value) || 0;
    const resp = await fetch('/api/calcular_individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renta, tramos: tramosActuales })
    });
    const data = await resp.json();

    const div = document.getElementById('resultado-individual');
    const diffClass = data.diferencia > 0 ? 'diff-positive' : data.diferencia < 0 ? 'diff-negative' : 'diff-zero';
    const sign = data.diferencia >= 0 ? '+' : '';

    div.innerHTML = `
        <div class="d-flex justify-content-between">
            <span>Cuota actual:</span><strong>${fmtEur(data.actual.cuota)}</strong>
        </div>
        <div class="d-flex justify-content-between">
            <span>Cuota simulada:</span><strong class="text-primary">${fmtEur(data.nuevo.cuota)}</strong>
        </div>
        <div class="d-flex justify-content-between">
            <span>Diferencia:</span><strong class="${diffClass}">${sign}${fmtEur(data.diferencia)}</strong>
        </div>
        <div class="d-flex justify-content-between">
            <span>Tipo efectivo actual:</span><span>${fmtPct(data.actual.tipo_efectivo)}</span>
        </div>
        <div class="d-flex justify-content-between">
            <span>Tipo efectivo nuevo:</span><span>${fmtPct(data.nuevo.tipo_efectivo)}</span>
        </div>
    `;
}
