"""
Datos fiscales del IRPF en España y motor de simulación.

Fuentes principales:
- Panel de Hogares: Ejercicio 2020. Documentos de Trabajo 2/2023, IEF.
  Pérez López, C.; Villanueva García, J.; Molinero Muñoz, I.; Vega Martínez, C.
  Instituto de Estudios Fiscales, Ministerio de Hacienda y Función Pública.
- AEAT: Estadísticas tributarias, modelo 100 (IRPF) y modelo 200 (IS).
- INE: DIRCE (Directorio Central de Empresas) 2020-2025.

Magnitudes AEAT 2020 de referencia (Tabla 7, Panel de Hogares IEF):
  - Retribuciones dinerarias: 481.437 M€
  - Base imponible general: 433.522 M€
  - Cuota íntegra estatal: 44.968 M€
  - Cuota íntegra autonómica: 45.177 M€
  - Cuota líquida estatal: 43.533 M€
  - Cuota líquida autonómica: 43.365 M€
  - Cuota resultante autoliquidación: 86.580 M€
  - Total pagos a cuenta: 83.178 M€
  - Declarantes (individual+conjunta): ~21,3 millones

Magnitudes RENTA2020 (Tabla 14, Panel de Hogares IEF):
  - Renta Bruta total: 674.978 M€
  - Rentas del Trabajo: 557.585 M€ (Salarios: 382.465 M€, Pensiones: 137.613 M€)
  - Rendimientos Actividades Económicas: 32.123 M€
  - Rentas Capital Mobiliario: 14.921 M€
  - Rentas Arrendamiento Inmuebles: 23.105 M€
  - Impuestos y Cotizaciones: 113.493 M€
  - Renta Bruta Disponible: 561.484 M€
"""

# =============================================================================
# TRAMOS IRPF 2024 (estatal + autonómico medio)
# =============================================================================
TRAMOS_ACTUALES = [
    {"limite": 12450, "tipo": 19.0, "nombre": "Tramo 1 (0 - 12.450€)"},
    {"limite": 20200, "tipo": 24.0, "nombre": "Tramo 2 (12.450 - 20.200€)"},
    {"limite": 35200, "tipo": 30.0, "nombre": "Tramo 3 (20.200 - 35.200€)"},
    {"limite": 60000, "tipo": 37.0, "nombre": "Tramo 4 (35.200 - 60.000€)"},
    {"limite": 300000, "tipo": 45.0, "nombre": "Tramo 5 (60.000 - 300.000€)"},
    {"limite": float('inf'), "tipo": 47.0, "nombre": "Tramo 6 (> 300.000€)"},
]

# =============================================================================
# DISTRIBUCIÓN DE DECLARANTES POR TRAMOS DE RENTA BRUTA
# Basada en los 9 estratos del Panel de Hogares IEF (pág. 6) y datos AEAT 2020.
# Total declarantes AEAT: ~21.318.268 (Tabla 6, muestra completa elevada)
# =============================================================================
DISTRIBUCION_DECLARANTES = [
    {
        "renta_media": 0,
        "declarantes": 420_000,
        "grupo": "Renta <= 0€",
        "renta_min": -50000,
        "renta_max": 0,
    },
    {
        "renta_media": 3200,
        "declarantes": 2_850_000,
        "grupo": "Hasta 6.000€",
        "renta_min": 0,
        "renta_max": 6000,
    },
    {
        "renta_media": 9000,
        "declarantes": 3_100_000,
        "grupo": "6.000 - 12.000€",
        "renta_min": 6000,
        "renta_max": 12000,
    },
    {
        "renta_media": 16500,
        "declarantes": 5_200_000,
        "grupo": "12.000 - 22.000€",
        "renta_min": 12000,
        "renta_max": 22000,
    },
    {
        "renta_media": 34000,
        "declarantes": 7_200_000,
        "grupo": "22.000 - 60.000€",
        "renta_min": 22000,
        "renta_max": 60000,
    },
    {
        "renta_media": 88000,
        "declarantes": 1_950_000,
        "grupo": "60.000 - 150.000€",
        "renta_min": 60000,
        "renta_max": 150000,
    },
    {
        "renta_media": 210000,
        "declarantes": 350_000,
        "grupo": "150.000 - 300.000€",
        "renta_min": 150000,
        "renta_max": 300000,
    },
    {
        "renta_media": 650000,
        "declarantes": 80_000,
        "grupo": "Más de 300.000€",
        "renta_min": 300000,
        "renta_max": 2000000,
    },
]

# =============================================================================
# PERFILES DE CIUDADANOS PARA SIMULACIÓN DETALLADA
# Basados en componentes de renta del Panel (Tabla 14)
# =============================================================================
PERFILES_CIUDADANOS = [
    {
        "nombre": "Pensionista mínimo",
        "renta_bruta": 9800,
        "descripcion": "Pensión mínima contributiva",
    },
    {
        "nombre": "Mileurista",
        "renta_bruta": 14000,
        "descripcion": "Salario mínimo / empleo parcial",
    },
    {
        "nombre": "Trabajador medio",
        "renta_bruta": 25000,
        "descripcion": "Salario medio España (INE 2020: 25.165€)",
    },
    {
        "nombre": "Profesional cualificado",
        "renta_bruta": 40000,
        "descripcion": "Técnico / profesional titulado",
    },
    {
        "nombre": "Directivo medio",
        "renta_bruta": 65000,
        "descripcion": "Mando intermedio / directivo PYME",
    },
    {
        "nombre": "Alto directivo",
        "renta_bruta": 120000,
        "descripcion": "Alta dirección / profesional sénior",
    },
    {
        "nombre": "Gran patrimonio",
        "renta_bruta": 400000,
        "descripcion": "Rentas elevadas (trabajo + capital + AAEE)",
    },
]

# =============================================================================
# PERFILES EMPRESARIALES
# Fuentes: DIRCE/INE 2020 (~3.4M empresas) + AEAT (IS, actividades económicas)
# Rend. Actividades Económicas AEAT: 32.123 M€ (Tabla 14)
# =============================================================================
PERFILES_EMPRESAS = [
    {
        "tipo": "Autónomo / Microempresa",
        "num_empresas": 1_750_000,
        "beneficio_medio": 18000,
        "empleados_medio": 1.5,
        "coste_ss_empleado": 3600,
        "descripcion": "Sin asalariados o 1-2 empleados",
    },
    {
        "tipo": "Pequeña empresa (3-9 emp.)",
        "num_empresas": 420_000,
        "beneficio_medio": 60000,
        "empleados_medio": 5,
        "coste_ss_empleado": 8400,
        "descripcion": "PYME pequeña",
    },
    {
        "tipo": "Mediana empresa (10-49 emp.)",
        "num_empresas": 130_000,
        "beneficio_medio": 250000,
        "empleados_medio": 22,
        "coste_ss_empleado": 9600,
        "descripcion": "PYME mediana",
    },
    {
        "tipo": "Empresa grande (50-249 emp.)",
        "num_empresas": 25_000,
        "beneficio_medio": 1_200_000,
        "empleados_medio": 100,
        "coste_ss_empleado": 10800,
        "descripcion": "Empresa grande",
    },
    {
        "tipo": "Gran corporación (250+ emp.)",
        "num_empresas": 5_500,
        "beneficio_medio": 15_000_000,
        "empleados_medio": 800,
        "coste_ss_empleado": 12000,
        "descripcion": "Multinacional / gran corporación",
    },
]

# Tipos del Impuesto de Sociedades vigentes
IS_TIPO_GENERAL = 25.0
IS_TIPO_PYME = 23.0       # Cifra de negocio < 1M€
IS_TIPO_NUEVAS = 15.0     # Empresas de nueva creación (2 primeros ejercicios)

# Magnitudes AEAT de referencia (miles de euros -> euros)
MAGNITUDES_AEAT_2020 = {
    "base_imponible_general": 433_522_089_156,
    "cuota_integra_estatal": 44_968_888_980,
    "cuota_integra_autonomica": 45_177_802_711,
    "cuota_liquida_estatal": 43_533_359_256,
    "cuota_liquida_autonomica": 43_365_490_198,
    "cuota_autoliquidacion": 86_580_801_634,
    "total_pagos_cuenta": 83_178_137_158,
    "renta_bruta_total": 674_978_345_824,
    "renta_disponible": 561_484_911_997,
    "rentas_trabajo": 557_585_255_487,
    "salarios": 382_465_683_303,
    "pensiones": 137_613_942_988,
    "rend_actividades_economicas": 32_123_216_168,
    "rentas_capital_mobiliario": 14_921_738_186,
    "rentas_arrendamiento_inmuebles": 23_105_626_860,
    "impuestos_cotizaciones": 113_493_433_827,
    "declarantes_aprox": 21_318_268,
}


def calcular_irpf(renta_bruta, tramos):
    """
    Calcula la cuota íntegra del IRPF aplicando tarifa progresiva.
    Aplica mínimo personal de 5.550€ (Art. 63 LIRPF).

    Parámetros:
        renta_bruta: Renta bruta anual en euros.
        tramos: Lista de tramos con 'limite' y 'tipo' (%).

    Retorna:
        dict con cuota, tipo_efectivo, base_liquidable y desglose por tramos.
    """
    minimo_personal = 5550
    base_liquidable = max(0, renta_bruta - minimo_personal)

    cuota = 0
    desglose = []
    base_restante = base_liquidable
    limite_anterior = 0

    for tramo in tramos:
        limite = tramo["limite"]
        tipo = tramo["tipo"] / 100.0

        ancho_tramo = limite - limite_anterior
        base_en_tramo = min(base_restante, ancho_tramo)

        if base_en_tramo <= 0:
            desglose.append({
                "nombre": tramo["nombre"],
                "tipo": tramo["tipo"],
                "base_en_tramo": 0,
                "cuota_tramo": 0,
            })
            limite_anterior = limite
            continue

        cuota_tramo = base_en_tramo * tipo
        cuota += cuota_tramo

        desglose.append({
            "nombre": tramo["nombre"],
            "tipo": tramo["tipo"],
            "base_en_tramo": round(base_en_tramo, 2),
            "cuota_tramo": round(cuota_tramo, 2),
        })

        base_restante -= base_en_tramo
        limite_anterior = limite

    tipo_efectivo = (cuota / renta_bruta * 100) if renta_bruta > 0 else 0

    return {
        "renta_bruta": renta_bruta,
        "base_liquidable": round(base_liquidable, 2),
        "cuota": round(cuota, 2),
        "tipo_efectivo": round(tipo_efectivo, 2),
        "desglose": desglose,
    }


def calcular_is(beneficio, tipo_is):
    """Calcula Impuesto de Sociedades simplificado."""
    cuota = beneficio * (tipo_is / 100.0)
    return {
        "beneficio": beneficio,
        "tipo_is": tipo_is,
        "cuota": round(cuota, 2),
        "beneficio_neto": round(beneficio - cuota, 2),
    }


def simular_recaudacion(tramos, tipo_is=None):
    """
    Simula la recaudación total del IRPF y del IS con los tramos/tipos dados.
    Usa la distribución de declarantes del Panel de Hogares IEF 2020
    y los perfiles empresariales basados en DIRCE/INE.
    """
    if tipo_is is None:
        tipo_is = IS_TIPO_GENERAL

    # --- Recaudación IRPF ---
    recaudacion_irpf_total = 0
    recaudacion_por_grupo = []

    for grupo in DISTRIBUCION_DECLARANTES:
        resultado = calcular_irpf(max(grupo["renta_media"], 0), tramos)
        recaudacion_grupo = resultado["cuota"] * grupo["declarantes"]
        recaudacion_irpf_total += recaudacion_grupo

        recaudacion_por_grupo.append({
            "grupo": grupo["grupo"],
            "declarantes": grupo["declarantes"],
            "renta_media": grupo["renta_media"],
            "cuota_media": resultado["cuota"],
            "tipo_efectivo": resultado["tipo_efectivo"],
            "recaudacion_total": round(recaudacion_grupo, 2),
        })

    # --- Recaudación IS ---
    recaudacion_is_total = 0
    costes_empresas = []

    for perfil in PERFILES_EMPRESAS:
        resultado_is = calcular_is(perfil["beneficio_medio"], tipo_is)
        recaudacion_empresa = resultado_is["cuota"] * perfil["num_empresas"]
        recaudacion_is_total += recaudacion_empresa

        coste_total_empresa = (
            resultado_is["cuota"]
            + perfil["empleados_medio"] * perfil["coste_ss_empleado"]
        )

        costes_empresas.append({
            "tipo_empresa": perfil["tipo"],
            "num_empresas": perfil["num_empresas"],
            "beneficio_medio": perfil["beneficio_medio"],
            "cuota_is": resultado_is["cuota"],
            "coste_ss_total": perfil["empleados_medio"] * perfil["coste_ss_empleado"],
            "coste_fiscal_total": round(coste_total_empresa, 2),
            "beneficio_neto": resultado_is["beneficio_neto"],
            "recaudacion_total": round(recaudacion_empresa, 2),
        })

    # --- Impacto en ciudadanos ---
    impacto_ciudadanos = []
    for perfil in PERFILES_CIUDADANOS:
        resultado = calcular_irpf(perfil["renta_bruta"], tramos)
        impacto_ciudadanos.append({
            "nombre": perfil["nombre"],
            "descripcion": perfil["descripcion"],
            "renta_bruta": perfil["renta_bruta"],
            "cuota_irpf": resultado["cuota"],
            "tipo_efectivo": resultado["tipo_efectivo"],
            "renta_neta": round(perfil["renta_bruta"] - resultado["cuota"], 2),
            "desglose": resultado["desglose"],
        })

    return {
        "recaudacion_irpf": round(recaudacion_irpf_total, 2),
        "recaudacion_is": round(recaudacion_is_total, 2),
        "recaudacion_total": round(recaudacion_irpf_total + recaudacion_is_total, 2),
        "detalle_irpf": recaudacion_por_grupo,
        "detalle_is": costes_empresas,
        "impacto_ciudadanos": impacto_ciudadanos,
        "total_declarantes": sum(g["declarantes"] for g in DISTRIBUCION_DECLARANTES),
        "magnitudes_referencia": MAGNITUDES_AEAT_2020,
    }


def comparar_escenarios(tramos_nuevos, tipo_is_nuevo=None):
    """
    Compara el escenario vigente con un escenario hipotético.
    Retorna ambas simulaciones y las diferencias detalladas.
    """
    actual = simular_recaudacion(TRAMOS_ACTUALES, IS_TIPO_GENERAL)
    nuevo = simular_recaudacion(tramos_nuevos, tipo_is_nuevo or IS_TIPO_GENERAL)

    diferencias_ciudadanos = []
    for act, nue in zip(actual["impacto_ciudadanos"], nuevo["impacto_ciudadanos"]):
        diferencias_ciudadanos.append({
            "nombre": act["nombre"],
            "renta_bruta": act["renta_bruta"],
            "cuota_actual": act["cuota_irpf"],
            "cuota_nueva": nue["cuota_irpf"],
            "diferencia": round(nue["cuota_irpf"] - act["cuota_irpf"], 2),
            "tipo_efectivo_actual": act["tipo_efectivo"],
            "tipo_efectivo_nuevo": nue["tipo_efectivo"],
        })

    diferencias_empresas = []
    for act, nue in zip(actual["detalle_is"], nuevo["detalle_is"]):
        diferencias_empresas.append({
            "tipo_empresa": act["tipo_empresa"],
            "cuota_actual": act["cuota_is"],
            "cuota_nueva": nue["cuota_is"],
            "diferencia": round(nue["cuota_is"] - act["cuota_is"], 2),
            "coste_total_actual": act["coste_fiscal_total"],
            "coste_total_nuevo": nue["coste_fiscal_total"],
        })

    return {
        "escenario_actual": actual,
        "escenario_nuevo": nuevo,
        "diferencia_recaudacion_irpf": round(
            nuevo["recaudacion_irpf"] - actual["recaudacion_irpf"], 2
        ),
        "diferencia_recaudacion_is": round(
            nuevo["recaudacion_is"] - actual["recaudacion_is"], 2
        ),
        "diferencia_recaudacion_total": round(
            nuevo["recaudacion_total"] - actual["recaudacion_total"], 2
        ),
        "diferencias_ciudadanos": diferencias_ciudadanos,
        "diferencias_empresas": diferencias_empresas,
    }
