"""
Simulador IRPF España - Aplicación Web
Análisis interactivo del impacto de distintos escenarios fiscales.

Fuentes de datos: AEAT, INE (DIRCE), Ministerio de Hacienda, Banco de España.
"""

import os
import secrets

from flask import Flask, render_template, request, jsonify

from data.irpf_data import (
    TRAMOS_ACTUALES,
    DISTRIBUCION_DECLARANTES,
    PERFILES_CIUDADANOS,
    PERFILES_EMPRESAS,
    DATOS_CCAA,
    IS_TIPO_GENERAL,
    calcular_irpf,
    simular_recaudacion,
    comparar_escenarios,
)

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))


@app.route("/")
def dashboard():
    return render_template(
        "dashboard.html",
        tramos=TRAMOS_ACTUALES,
        perfiles=PERFILES_CIUDADANOS,
        empresas=PERFILES_EMPRESAS,
        distribucion=DISTRIBUCION_DECLARANTES,
        is_tipo=IS_TIPO_GENERAL,
        user="invitado",
    )


@app.route("/api/simular", methods=["POST"])
def api_simular():
    """
    Recibe tramos personalizados y tipo IS, devuelve comparativa completa.
    Body JSON esperado:
    {
        "tramos": [{"limite": 12450, "tipo": 19}, ...],
        "tipo_is": 25.0
    }
    """
    data = request.get_json()
    if not data or "tramos" not in data:
        return jsonify({"error": "Datos no válidos"}), 400

    tramos_nuevos = []
    for i, t in enumerate(data["tramos"]):
        tramos_nuevos.append({
            "limite": float(t["limite"]) if t["limite"] != "Infinity" else float('inf'),
            "tipo": float(t["tipo"]),
            "nombre": t.get("nombre", f"Tramo {i+1}")
        })

    tipo_is = float(data.get("tipo_is", IS_TIPO_GENERAL))
    resultado = comparar_escenarios(tramos_nuevos, tipo_is)
    return jsonify(resultado)


@app.route("/api/calcular_individual", methods=["POST"])
def api_calcular_individual():
    """
    Calcula IRPF para una renta individual con tramos personalizados.
    """
    data = request.get_json()
    renta = float(data.get("renta", 0))

    tramos_nuevos = []
    for i, t in enumerate(data.get("tramos", TRAMOS_ACTUALES)):
        tramos_nuevos.append({
            "limite": float(t["limite"]) if t["limite"] != "Infinity" else float('inf'),
            "tipo": float(t["tipo"]),
            "nombre": t.get("nombre", f"Tramo {i+1}")
        })

    resultado_actual = calcular_irpf(renta, TRAMOS_ACTUALES)
    resultado_nuevo = calcular_irpf(renta, tramos_nuevos)

    return jsonify({
        "actual": resultado_actual,
        "nuevo": resultado_nuevo,
        "diferencia": round(resultado_nuevo["cuota"] - resultado_actual["cuota"], 2)
    })


@app.route("/api/simular_batch", methods=["POST"])
def api_simular_batch():
    """
    Simula múltiples escenarios en una sola petición.
    Body JSON: { "escenarios": [ { "tramos": [...tipos...], "tipo_is": 25.0 }, ... ] }
    Retorna resumen de cada escenario para el agente RL.
    """
    data = request.get_json()
    if not data or "escenarios" not in data:
        return jsonify({"error": "Datos no válidos"}), 400

    resultados = []
    for esc in data["escenarios"]:
        tipos = esc.get("tramos", [19, 24, 30, 37, 45, 47])
        tipo_is = float(esc.get("tipo_is", IS_TIPO_GENERAL))

        tramos_nuevos = []
        for i, t in enumerate(TRAMOS_ACTUALES):
            tramos_nuevos.append({
                "limite": t["limite"],
                "tipo": float(tipos[i]) if i < len(tipos) else t["tipo"],
                "nombre": t["nombre"]
            })

        resultado = comparar_escenarios(tramos_nuevos, tipo_is)
        ea = resultado["escenario_actual"]
        en = resultado["escenario_nuevo"]

        # Calcular tipo efectivo medio ponderado
        total_cuota = sum(g["recaudacion_total"] for g in en["detalle_irpf"])
        total_base = sum(g["declarantes"] * g["renta_media"] for g in en["detalle_irpf"])
        tipo_ef_medio = (total_cuota / total_base * 100) if total_base > 0 else 0

        # Índice de progresividad: ratio tipo ef. tramo más alto / primer tramo con tipo > 0
        tipos_ef = [g.get("tipo_efectivo", 0) for g in en["detalle_irpf"]]
        tipos_ef_pos = [t for t in tipos_ef if t > 0]
        if len(tipos_ef_pos) >= 2:
            progresividad = tipos_ef_pos[-1] / tipos_ef_pos[0]
        elif len(tipos_ef_pos) == 1:
            progresividad = 1.0
        else:
            progresividad = 0.0
        # Índice Kakwani simplificado: diferencia entre tipo marginal más alto y más bajo
        kakwani = (max(tipos_ef) - min(t for t in tipos_ef)) if tipos_ef else 0

        resultados.append({
            "recaudacion_irpf": en["recaudacion_irpf"],
            "recaudacion_is": en["recaudacion_is"],
            "recaudacion_total": en["recaudacion_total"],
            "diff_recaudacion": resultado["diferencia_recaudacion_total"],
            "tipo_efectivo_medio": round(tipo_ef_medio, 2),
            "progresividad": round(progresividad, 2),
            "kakwani": round(kakwani, 2),
            "tipos": tipos,
        })

    return jsonify({"resultados": resultados})


@app.route("/api/datos_base")
def api_datos_base():
    """Devuelve los datos base para inicializar la interfaz."""
    tramos_serializables = []
    for t in TRAMOS_ACTUALES:
        tramos_serializables.append({
            "limite": t["limite"] if t["limite"] != float('inf') else "Infinity",
            "tipo": t["tipo"],
            "nombre": t["nombre"]
        })
    return jsonify({
        "tramos": tramos_serializables,
        "perfiles_ciudadanos": PERFILES_CIUDADANOS,
        "perfiles_empresas": [{
            "tipo": e["tipo"],
            "num_empresas": e["num_empresas"],
            "beneficio_medio": e["beneficio_medio"],
            "empleados_medio": e["empleados_medio"],
            "descripcion": e["descripcion"],
        } for e in PERFILES_EMPRESAS],
        "distribucion": DISTRIBUCION_DECLARANTES,
        "tipo_is": IS_TIPO_GENERAL,
        "ccaa": DATOS_CCAA,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
