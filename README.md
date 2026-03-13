# Simulador Fiscal IRPF/IS - España

Aplicacion web interactiva para analizar el impacto de distintos escenarios fiscales del IRPF e Impuesto de Sociedades en Espana.

## Funcionalidades

- **Modificacion interactiva de tramos IRPF**: Sliders y campos numericos para ajustar el tipo marginal de cada tramo
- **Modificacion del tipo de Sociedades**: Ajuste del tipo IS aplicable
- **Escenarios predefinidos**: Tipo unico 15%/20%, progresivo alto, reducido PYME
- **Calculo individual**: Introduce una renta bruta y obtiene cuota e impacto
- **Visualizacion de recaudacion**: Graficos de barras, donuts y curvas comparativas
- **Impacto por perfil de ciudadano**: Mileurista, trabajador medio, profesional, directivo, gran patrimonio
- **Coste para empresas**: Autonomos, PYMEs, medianas, grandes corporaciones
- **Comparativa actual vs simulado**: Tablas detalladas con diferencias absolutas y porcentuales

## Fuentes de datos

- **AEAT**: Estadisticas de declarantes del IRPF, Impuesto de Sociedades, VESeS
- **INE**: DIRCE (Directorio Central de Empresas), Sociedades Mercantiles
- **Ministerio de Hacienda**: Presupuestos y beneficios fiscales
- **Seguridad Social**: Afiliacion por actividad y provincia

## Instalacion

```bash
pip install -r requirements.txt
python app.py
```

Acceder a `http://localhost:5000`

## Credenciales

- Usuario: `jaime`
- Contrasena: `Jaime26$`

## Tecnologias

- **Backend**: Python + Flask
- **Frontend**: Bootstrap 5, Chart.js
- **Motor de simulacion**: Calculo progresivo IRPF, IS, microsimulacion por perfiles

## Metodologia

El simulador implementa:
1. Calculo progresivo del IRPF con minimo personal (5.550 EUR)
2. Distribucion de declarantes basada en datos AEAT 2022 (~21.7M declarantes)
3. Perfiles empresariales basados en DIRCE/INE (~3.3M empresas)
4. Comparacion contrafactual entre escenario vigente y escenario simulado
5. Estimacion de recaudacion agregada por tramo y por tipo de empresa
