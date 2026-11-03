# BUILD-REPORT — Company Brain v1: NovaTech Solutions, SRL

**Fecha:** 2026-11-02 · **Dataset:** `novatech-v1` · **Ubicación:** `~/workspace/company-brain-build/novatech/`
**Naturaleza:** EMPRESA 100% FICTICIA — material de demostración para el hackathon Meta de Postor.
Todos los documentos físicos llevan la marca "DOCUMENTO FICTICIO — MATERIAL DE DEMOSTRACIÓN" en el pie de cada página (verificado: 37/37 PDFs).

## Estructura

| Archivo | Contenido |
|---|---|
| `company-profile.json` | Modelo extendido: company, 9 capabilities con `verification_level`/`source`/`relations`, certifications (3 individuales vigentes + listas vacías de fabricante/ISO), 5 proyectos con `evidence_document_ids[]`, `financial_profile` (ingresos 2024 RD$8.4M / 2025 RD$10.2M, activos 7.5M, pasivos 2.8M, patrimonio 4.7M), 12 personas, 4 proveedores, compliance (DGII/TSS/RNC/registro), `known_gaps_summary` |
| `company/` | 40 documentos ficticios en 5 tandas |
| `docs-graph.json` | 55 nodos / 79 aristas: DOCUMENTO → PROYECTO → CAPACIDAD |
| `expected-results/scenarios.json` | 7 escenarios como **OBJETIVOS DE DISEÑO** (no decisiones finales) |
| `dataset-manifest.json` | Inventario completo por tanda + lista de brechas deliberadas |
| `build_dataset.py` | Script generador (reproducible) |

## Conteo por tanda

| Tanda | Contenido | Cantidad |
|---|---|---|
| 1 · Identidad | Registro mercantil, constancia RNC, estatutos, cert. fiscal DGII, cert. TSS, perfil corporativo (.md), listado de personal (.csv) | 7 |
| 2 · Experiencia | 5 contratos, 6 facturas, 3 actas de recepción, 2 referencias comerciales | 16 |
| 3 · Capacidad técnica | 6 CV, 4 certificaciones (3 vigentes + 1 vencida), inventario de equipos (.csv) | 11 |
| 4 · Financiera | Estados financieros 2024 y 2025 | 2 |
| 5 · Proveedores | 4 cotizaciones | 4 |
| **Total** | | **40** |

Formatos variados: PDFs con layouts distintos (Times formal, Helvetica corporativo, Courier contractual, tablas de factura/cotización con paletas diferentes), 2 CSV y 1 Markdown. No comparten una sola plantilla.

## Brechas deliberadas (corazón de la demo)

1. **Sin autorización Microsoft partner** ni de ningún fabricante (`manufacturer_authorizations: []`) → escenario NO-GO para licencias.
2. **Sin certificaciones ISO empresariales** (`company_certifications: []`).
3. **PROJECT-002 sin acta de recepción** (solo contrato + factura) → GO con condiciones.
4. **PROJECT-005 sin acta de cierre** (servicio en curso hasta dic-2025) → GO con condiciones.
5. **2 cotizaciones vencidas:** DOC-QUOT-002 (venció 2026-06-30), DOC-QUOT-003 (venció 2026-08-15).
6. **DOC-QUOT-004:** producto que no cumple especificaciones (laptop 4GB RAM < mínimo 8GB).
7. **DOC-CERT-EXP-001:** CCNA vencida el 2025-06-30.
8. **Estados financieros solo 2024–2025** (sin histórico adicional).
9. **Inventario operativo limitado**, sin stock para reventa a gran escala.

## Consistencia verificada

- PROJECT-001: contrato RD$2,450,000 = facturas 980,000 + 1,470,000; acta y referencia enlazadas.
- Todos los `evidence_document_ids` existen como archivo; todas las aristas del grafo referencian nodos válidos; los 7 escenarios referencian documentos existentes. **0 errores.**
- IDs estables: `DOC-CONTRACT-001`, `DOC-INVOICE-001/002`, `DOC-ACCEPTANCE-001`, `PROJECT-001`, etc.

## Datos ficticios usados

RNC `131-48271-9` · Registro mercantil `489231-SD` · RPE `882145` · Cédulas `001-0000000-X` · Teléfonos `809-555-XXXX` · Dominio `novatech-demo.do`. Clientes ficticios: Grupo Empresarial del Caribe, Distribuidora Nacional del Este, Servicios Integrados del Cibao, Centro Empresarial del Norte, Soluciones Administrativas del Sur.

## Notas / inconsistencias no resueltas

- **Ninguna inconsistencia pendiente.** Punto a tener en cuenta para el ajuste fino con licitaciones reales: la certificación fiscal DGII vence el 19/11/2026 y la TSS el 04/12/2026 — si los procesos reales cierran después, el padre deberá decidir si se "renuevan" los documentos o se usan como brecha adicional de vigencia.
- El escenario SC-06 quedó como "NO_GO o NEEDS_REVIEW" a propósito (depende del volumen del proceso real).

## v1.1 — Ajuste fino contra licitaciones reales (2026-11-02 noche)

Calibrado contra los pliegos reales descargados del portal DGCP:

- **DOC-CV-004 (Carla)**: experiencia demostrable en Azure, Nube y DevOps (caso A/CNE exige CV con esa experiencia, pliego p4).
- **PROJECT-004**: alcance actualizado a "instalación de 14 access points Wi-Fi 6" en contrato, factura y acta (caso B/INDOTEL exige 2+ proyectos Wi-Fi, 10+ AP en conjunto, 1 con 12+ meses de soporte).
- **DOC-LEGAL-006 (nuevo)**: constancia RPE ficticia RPE-882145 + entrada en compliance (caso A/CNE exige RPE activo).
- **expected-results/scenarios.json**: reescrito con los 4 casos reales y cláusulas verificadas:
  - Caso C (UAF/Microsoft 365): NO-GO confirmado — carta de certificación de fábrica [Subsanable] (p11), criterio CUMPLE/NO CUMPLE (p19), SNCC_F047 (p45), licenciamiento CSP (p4).
  - Caso D (ISFODOSU): NEEDS_REVIEW — índices financieros cumplen (solvencia 2.68, liquidez 1.8, endeudamiento 0.60); el contrato = 86% de la facturación anual.
- Brechas que quedan como condiciones del caso B: CCNA vencida (sin cert. de cableado estructurado) y 0 cartas de fabricante.
- Script del parche: `~/workspace/company-brain-build/patch_v11.py` (reproducible).
