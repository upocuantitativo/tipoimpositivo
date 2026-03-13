"""
Simulador IRPF España - Aplicación Web
Análisis interactivo del impacto de distintos escenarios fiscales.

Fuentes de datos: AEAT, INE (DIRCE), Ministerio de Hacienda, Banco de España.
"""

import os
import secrets
from functools import wraps

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

from data.irpf_data import (
    TRAMOS_ACTUALES,
    DISTRIBUCION_DECLARANTES,
    PERFILES_CIUDADANOS,
    PERFILES_EMPRESAS,
    IS_TIPO_GENERAL,
    calcular_irpf,
    simular_recaudacion,
    comparar_escenarios,
)

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))

# Usuarios autorizados (hash de contraseña)
USUARIOS = {
    "jaime": generate_password_hash("Jaime26$"),
}


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if username in USUARIOS and check_password_hash(USUARIOS[username], password):
            session["user"] = username
            return redirect(url_for("dashboard"))
        error = "Usuario o contraseña incorrectos"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    return render_template(
        "dashboard.html",
        tramos=TRAMOS_ACTUALES,
        perfiles=PERFILES_CIUDADANOS,
        empresas=PERFILES_EMPRESAS,
        distribucion=DISTRIBUCION_DECLARANTES,
        is_tipo=IS_TIPO_GENERAL,
        user=session["user"],
    )


@app.route("/api/simular", methods=["POST"])
@login_required
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
@login_required
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


@app.route("/api/datos_base")
@login_required
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
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
