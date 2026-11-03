#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador del dataset v1 del Company Brain de NovaTech Solutions, SRL.
EMPRESA 100% FICTICIA - material de demostracion para el hackathon Meta de Postor.
Todos los documentos llevan marca de agua de ficcion. RNC ficticio 131-48271-9.
"""
import json, os, csv
from fpdf import FPDF

ROOT = os.path.expanduser("~/workspace/company-brain-build/novatech")
COMP = os.path.join(ROOT, "company")
EXP  = os.path.join(ROOT, "expected-results")
os.makedirs(COMP, exist_ok=True)
os.makedirs(EXP, exist_ok=True)

def t(s):
    """Sanitiza a latin-1 para las fuentes core de fpdf2."""
    return (s.replace("\u2014", "-").replace("\u2013", "-")
             .replace("\u00b7", "-").replace("\u201c", '"').replace("\u201d", '"')
             .replace("\u2018", "'").replace("\u2019", "'").replace("\u2026", "...")
             .replace("\u20ac", "EUR").replace("\u2713", "OK"))

WM = t("DOCUMENTO FICTICIO - MATERIAL DE DEMOSTRACION | NovaTech Solutions, SRL (empresa ficticia)")

COMPANY = {
    "legal_name": "NovaTech Solutions, SRL",
    "trade_name": "NovaTech",
    "rnc": "131-48271-9",
    "mercantile": "489231-SD",
    "mercantile_issuer": "Camara de Comercio y Produccion de Santo Domingo",
    "rpe": "882145",
    "founded": "2020-02-18",
    "slogan": "Tecnologia que transforma operaciones.",
    "address": "Av. Tiradentes 456, Naco, Santo Domingo, Rep. Dom.",
    "phones": ["809-555-0142", "829-555-0177"],
    "email": "info@novatech-demo.do",
    "web": "www.novatech-demo.do",
}

TEAM = [
    ("Miguel Angel Peralta Cruz",  "001-0000000-2", "Gerente General",              "Direccion"),
    ("Laura Isabel Mendez Torres", "001-0000000-3", "Gerente de Proyectos",         "Proyectos"),
    ("Rafael Eduardo Castillo Nunez","001-0000000-4","Arquitecto de Software",      "Ingenieria"),
    ("Jose Miguel Duarte Pena",    "001-0000000-5", "Desarrollador Full-Stack",     "Ingenieria"),
    ("Carla Maria Rosario Diaz",   "001-0000000-6", "Desarrolladora Full-Stack",    "Ingenieria"),
    ("Pedro Luis Vargas Jimenez",  "001-0000000-7", "Desarrollador Full-Stack",     "Ingenieria"),
    ("Ana Sofia Hernandez Mora",   "001-0000000-8", "Desarrolladora Mobile",        "Ingenieria"),
    ("Carlos Daniel Reyes Santana","001-0000000-9", "Ingeniero de Infraestructura", "Infraestructura"),
    ("Mariela Esther Pinales Rojas","001-0000001-0","Especialista de Soporte IT",   "Soporte"),
    ("Jonathan Rafael Cuevas Lopez","001-0000001-1","Especialista de Soporte IT",   "Soporte"),
    ("Yocasta Beltran Franco",     "001-0000001-2", "Analista de Sistemas",         "Proyectos"),
    ("Rosa Amelia Guzman Tapia",   "001-0000001-3", "Administracion y Finanzas",    "Administracion"),
]
TEAM = [dict(name=n, cedula=c, position=p, dept=d) for n, c, p, d in TEAM]

PROJECTS = [
    dict(id="PROJECT-001", title="Sistema de Gestion Documental Empresarial",
         client="Grupo Empresarial del Caribe", start="2024-03-04", end="2024-11-20",
         value=2450000, currency="DOP", category="software_development",
         caps=["software_development", "system_integration"],
         desc="Diseno, desarrollo e implementacion de una plataforma web para gestionar documentos, usuarios, aprobaciones y flujos de trabajo.",
         tech=["Python/Django", "PostgreSQL", "React", "Docker"],
         scope=["Aplicacion web y API REST", "Gestion de roles y permisos", "Migracion de informacion",
                "Capacitacion de usuarios", "Soporte posterior a la implementacion"],
         evidence=["DOC-CONTRACT-001", "DOC-INVOICE-001", "DOC-INVOICE-002", "DOC-ACCEPTANCE-001", "DOC-REF-001"],
         has_acceptance=True, gap=None),
    dict(id="PROJECT-002", title="Plataforma de Gestion de Inventario",
         client="Distribuidora Nacional del Este", start="2023-01-16", end="2023-09-28",
         value=1850000, currency="DOP", category="software_development",
         caps=["software_development", "system_integration"],
         desc="Sistema de control de inventario, ordenes, almacenes, usuarios y reportes operativos.",
         tech=[".NET 7", "SQL Server", "Angular"],
         scope=["Aplicacion web", "Base de datos centralizada", "Integracion con servicios externos", "Reportes operativos"],
         evidence=["DOC-CONTRACT-002", "DOC-INVOICE-003"],
         has_acceptance=False, gap="Sin acta de recepcion: existe contrato y factura, pero no hay evidencia formal de aceptacion del cliente."),
    dict(id="PROJECT-003", title="Aplicacion Movil de Servicios",
         client="Servicios Integrados del Cibao", start="2025-02-10", end="2025-10-22",
         value=1200000, currency="DOP", category="software_development",
         caps=["software_development", "mobile_development"],
         desc="Desarrollo de aplicaciones moviles para clientes y personal operativo, con backend y notificaciones.",
         tech=["Flutter", "Firebase", "Node.js"],
         scope=["Aplicacion iOS y Android", "Backend y APIs", "Notificaciones push", "Integracion con servicios empresariales"],
         evidence=["DOC-CONTRACT-003", "DOC-INVOICE-004", "DOC-ACCEPTANCE-003", "DOC-REF-002"],
         has_acceptance=True, gap=None),
    dict(id="PROJECT-004", title="Infraestructura y Redes",
         client="Centro Empresarial del Norte", start="2022-05-09", end="2022-12-10",
         value=980000, currency="DOP", category="network_infrastructure",
         caps=["network_infrastructure", "technical_support"],
         desc="Configuracion de infraestructura de red, estaciones de trabajo y soporte tecnico.",
         tech=["Cisco", "Ubiquiti", "Windows Server"],
         scope=["Instalacion y configuracion", "Equipos de networking", "Mantenimiento", "Documentacion tecnica"],
         evidence=["DOC-CONTRACT-004", "DOC-INVOICE-005", "DOC-ACCEPTANCE-004"],
         has_acceptance=True, gap=None),
    dict(id="PROJECT-005", title="Soporte y Mantenimiento Tecnologico",
         client="Soluciones Administrativas del Sur", start="2025-01-06", end="2025-12-31",
         value=720000, currency="DOP", category="technical_support",
         caps=["technical_support"],
         desc="Servicio de soporte tecnologico y mantenimiento preventivo y correctivo, con reportes mensuales.",
         tech=["GLPI", "AnyDesk", "Zabbix"],
         scope=["Soporte a usuarios", "Mantenimiento de equipos", "Gestion de incidencias", "Reportes mensuales"],
         evidence=["DOC-CONTRACT-005", "DOC-INVOICE-006"],
         has_acceptance=False, gap="Contrato en curso y factura parcial; sin acta de cierre (servicio vigente hasta dic-2025)."),
]

SUPPLIERS = [
    dict(id="SUP-001", name="TecnoSuministros del Caribe, SRL", line="Equipos Dell y Lenovo"),
    dict(id="SUP-002", name="Redes y Conectividad RD, SRL", line="Networking y telecomunicaciones"),
    dict(id="SUP-003", name="Licencias y Software Empresarial LSE, SRL", line="Licencias y software empresarial"),
    dict(id="SUP-004", name="Componentes y Perifericos CP, SRL", line="Componentes y perifericos"),
]

CERTS = [
    dict(id="DOC-CERT-001", person="Rafael Eduardo Castillo Nunez", title="AWS Certified Solutions Architect - Associate",
         issuer="Amazon Web Services", issued="2024-04-10", expires="2027-04-10", status="vigente"),
    dict(id="DOC-CERT-002", person="Laura Isabel Mendez Torres", title="Project Management Professional (PMP)",
         issuer="Project Management Institute", issued="2024-01-31", expires="2027-01-31", status="vigente"),
    dict(id="DOC-CERT-003", person="Carla Maria Rosario Diaz", title="Microsoft Certified: Azure Administrator Associate",
         issuer="Microsoft", issued="2024-09-01", expires="2027-09-01", status="vigente"),
    dict(id="DOC-CERT-EXP-001", person="Carlos Daniel Reyes Santana", title="Cisco Certified Network Associate (CCNA)",
         issuer="Cisco", issued="2022-06-30", expires="2025-06-30", status="VENCIDA - brecha deliberada"),
]

# ---------------------------------------------------------------- helpers PDF
class Doc(FPDF):
    def footer(self):
        self.set_y(-13)
        self.set_font("helvetica", "I", 7)
        self.set_text_color(178, 34, 34)
        self.cell(0, 5, WM, align="C")

def new_doc():
    d = Doc("P", "mm", "Letter")
    d.set_auto_page_break(True, 18)
    return d

def band(d, text, r=11, g=58, b=107):
    d.set_fill_color(r, g, b)
    d.set_text_color(255, 255, 255)
    d.set_font("helvetica", "B", 13)
    d.cell(0, 10, t(text), ln=True, fill=True, align="C")
    d.set_text_color(0, 0, 0)
    d.ln(3)

def seal_box(d, text, w=70):
    x0 = (d.w - w) / 2
    y0 = d.get_y()
    d.set_draw_color(178, 34, 34)
    d.set_line_width(0.8)
    d.rect(x0, y0, w, 22)
    d.set_xy(x0, y0 + 4)
    d.set_font("helvetica", "B", 9)
    d.set_text_color(178, 34, 34)
    d.multi_cell(w, 5, t(text), align="C")
    d.set_text_color(0, 0, 0)
    d.set_y(y0 + 26)

def money(n):
    return "RD$ {:,.2f}".format(n)

def save(d, doc_id, ext="pdf"):
    path = os.path.join(COMP, doc_id + "." + ext)
    d.output(path)
    return path

MANIFEST = []
def reg(doc_id, batch, kind, purpose, status="vigente", gap=None):
    MANIFEST.append({"doc_id": doc_id, "file": doc_id + (".csv" if kind == "csv" else ".md" if kind == "md" else ".pdf"),
                     "batch": batch, "kind": kind, "purpose": purpose, "status": status, "gap": gap,
                     "fictional": True})

# ============================================================ TANDA 1: IDENTIDAD
def doc_registro_mercantil():
    d = new_doc(); d.add_page()
    d.set_font("times", "B", 14)
    d.cell(0, 8, t("CAMARA DE COMERCIO Y PRODUCCION"), ln=True, align="C")
    d.cell(0, 8, t("DE SANTO DOMINGO"), ln=True, align="C")
    d.set_font("times", "", 11); d.ln(2)
    d.cell(0, 7, t("CERTIFICADO DE REGISTRO MERCANTIL"), ln=True, align="C")
    d.ln(4)
    rows = [("Razon social:", COMPANY["legal_name"]), ("Nombre comercial:", COMPANY["trade_name"]),
            ("RNC:", COMPANY["rnc"]), ("No. Registro Mercantil:", COMPANY["mercantile"]),
            ("Tipo societario:", "Sociedad de Responsabilidad Limitada (SRL)"),
            ("Fecha de constitucion:", "18 de febrero de 2020"),
            ("Fecha de emision:", "2 de marzo de 2020"),
            ("Domicilio:", COMPANY["address"]),
            ("Objeto social:", "Consultoria tecnologica, desarrollo de software, integracion de sistemas, infraestructura y soporte IT."),
            ("Capital social:", "RD$ 5,000,000.00"),
            ("Gerente general:", "Miguel Angel Peralta Cruz"),]
    for k, v in rows:
        d.set_font("times", "B", 11); d.cell(52, 7, t(k))
        d.set_font("times", "", 11); d.multi_cell(0, 7, t(v), new_x="LMARGIN")
    d.ln(4); d.set_font("times", "I", 10)
    d.multi_cell(0, 6, t("Estado: VIGENTE. Este documento es ficticio y se emite unicamente con fines de demostracion del Company Brain de Postor."))
    seal_box(d, "SELLO FICTICIO\nCamara de Comercio SD")
    save(d, "DOC-LEGAL-001"); reg("DOC-LEGAL-001", 1, "pdf", "Acredita existencia legal de la empresa (ficticia).")

def doc_constancia_rnc():
    d = new_doc(); d.add_page()
    band(d, "CONSTANCIA DE REGISTRO NACIONAL DE CONTRIBUYENTES")
    d.set_font("helvetica", "", 10)
    d.cell(0, 7, t("Direccion General de Impuestos Internos (DGII) - DOCUMENTO FICTICIO"), ln=True, align="C")
    d.ln(4)
    d.set_fill_color(235, 240, 248)
    rows = [("RNC", COMPANY["rnc"]), ("Razon social", COMPANY["legal_name"]),
            ("Nombre comercial", COMPANY["trade_name"]), ("Tipo de contribuyente", "Persona Juridica - SRL"),
            ("Actividad economica", "Consultoria y servicios tecnologicos"), ("Fecha de inscripcion", "20/02/2020"),
            ("Estado", "ACTIVO"), ("Fecha de emision", "15/10/2026")]
    for i, (k, v) in enumerate(rows):
        fill = i % 2 == 0
        d.set_font("helvetica", "B", 10); d.cell(60, 8, t(k), fill=fill)
        d.set_font("helvetica", "", 10); d.cell(0, 8, t(v), ln=True, fill=fill)
    d.ln(4); d.set_font("helvetica", "I", 9)
    d.multi_cell(0, 6, t("Documento ficticio generado para la demo Company Brain. No constituye una constancia real de la DGII."))
    save(d, "DOC-LEGAL-002"); reg("DOC-LEGAL-002", 1, "pdf", "Identidad fiscal de la empresa (ficticia).")

def doc_estatutos():
    d = new_doc(); d.add_page()
    d.set_font("courier", "B", 13); d.cell(0, 9, t("ESTATUTOS SOCIALES"), ln=True, align="C")
    d.set_font("courier", "", 10); d.cell(0, 7, t(COMPANY["legal_name"]), ln=True, align="C"); d.ln(3)
    arts = [
        ("ARTICULO 1 - Denominacion", "La sociedad se denomina " + COMPANY["legal_name"] + ", sociedad de responsabilidad limitada organizada bajo las leyes de la Republica Dominicana."),
        ("ARTICULO 2 - Domicilio", "Su domicilio social esta en " + COMPANY["address"] + "."),
        ("ARTICULO 3 - Objeto", "Diseno, desarrollo, implementacion, integracion y soporte de soluciones tecnologicas; consultoria IT; suministro de equipos informaticos y servicios conexos."),
        ("ARTICULO 4 - Duracion", "La sociedad tendra una duracion indefinida."),
        ("ARTICULO 5 - Capital", "El capital social es de RD$5,000,000.00 dividido en 5,000 cuotas sociales de RD$1,000.00 cada una."),
        ("ARTICULO 6 - Administracion", "La sociedad sera administrada por un Gerente General, actualmente el Sr. Miguel Angel Peralta Cruz."),
        ("ARTICULO 7 - Disposicion final", "Documento ficticio redactado exclusivamente para la demostracion del Company Brain de Postor."),
    ]
    for title, body in arts:
        d.set_font("courier", "B", 10); d.cell(0, 7, t(title), ln=True)
        d.set_font("courier", "", 10); d.multi_cell(0, 6, t(body)); d.ln(2)
    d.set_font("courier", "I", 9)
    d.multi_cell(0, 6, t("Firmas ficticias omitidas. Material de demostracion - sin valor legal."))
    save(d, "DOC-LEGAL-003"); reg("DOC-LEGAL-003", 1, "pdf", "Estatutos sociales ficticios.")

def doc_certificacion_fiscal():
    d = new_doc(); d.add_page()
    d.set_font("helvetica", "B", 12)
    d.cell(0, 8, t("DIRECCION GENERAL DE IMPUESTOS INTERNOS"), ln=True, align="C")
    d.set_font("helvetica", "B", 11); d.cell(0, 8, t("CERTIFICACION DE CUMPLIMIENTO FISCAL (FICTICIA)"), ln=True, align="C")
    d.ln(4); d.set_font("helvetica", "", 11)
    d.multi_cell(0, 7, t("Por medio de la presente SE HACE CONSTAR (en este escenario ficticio) que " + COMPANY["legal_name"] + ", RNC " + COMPANY["rnc"] + ", se encuentra AL DIA en el cumplimiento de sus obligaciones fiscales ante la DGII a la fecha de emision."))
    d.ln(3)
    for k, v in [("Fecha de emision:", "20 de octubre de 2026"), ("Vigencia:", "30 dias (hasta el 19/11/2026)"),
                 ("No. de certificacion:", "CF-2026-88412-FICT")]:
        d.set_font("helvetica", "B", 11); d.cell(55, 7, t(k))
        d.set_font("helvetica", "", 11); d.cell(0, 7, t(v), ln=True)
    d.ln(6); d.set_font("helvetica", "I", 10)
    d.multi_cell(0, 6, t("Nota: documento ficticio. En un caso real, el agente deberia verificar la vigencia contra la fecha de cierre de cada licitacion."))
    d.ln(8); d.cell(0, 6, t("______________________________"), ln=True, align="C")
    d.set_font("helvetica", "", 9); d.cell(0, 6, t("Firma ficticia - Encargado de Certificaciones (demo)"), ln=True, align="C")
    save(d, "DOC-LEGAL-004"); reg("DOC-LEGAL-004", 1, "pdf", "Certificacion fiscal ficticia, vigente al 19/11/2026.")

def doc_certificacion_tss():
    d = new_doc(); d.add_page()
    band(d, "TESORERIA DE LA SEGURIDAD SOCIAL", 0, 102, 102)
    d.set_font("helvetica", "B", 11); d.cell(0, 8, t("CERTIFICACION DE PAGOS AL DIA (FICTICIA)"), ln=True, align="C")
    d.ln(3); d.set_font("helvetica", "", 11)
    d.multi_cell(0, 7, t("Se certifica (en este escenario ficticio) que " + COMPANY["legal_name"] + ", RNC " + COMPANY["rnc"] + ", registra sus 12 empleados y se encuentra AL DIA en el pago de las cotizaciones a la Seguridad Social."))
    d.ln(3)
    for k, v in [("Empleados registrados:", "12"), ("Fecha de emision:", "5 de octubre de 2026"),
                 ("Vigencia:", "60 dias (hasta el 04/12/2026)"), ("No. de certificacion:", "TSS-2026-55190-FICT")]:
        d.set_font("helvetica", "B", 11); d.cell(55, 7, t(k))
        d.set_font("helvetica", "", 11); d.cell(0, 7, t(v), ln=True)
    d.ln(6); d.set_font("helvetica", "I", 10)
    d.multi_cell(0, 6, t("Documento ficticio con fines de demostracion."))
    save(d, "DOC-LEGAL-005"); reg("DOC-LEGAL-005", 1, "pdf", "Certificacion TSS ficticia, vigente al 04/12/2026.")

def doc_perfil_corporativo():
    lines = [
        "# " + COMPANY["trade_name"] + " - " + COMPANY["legal_name"],
        "",
        "> **DOCUMENTO FICTICIO - MATERIAL DE DEMOSTRACION.** Empresa, personas, clientes y cifras inventados para el hackathon Meta de Postor.",
        "",
        "## Quienes somos",
        "",
        COMPANY["slogan"],
        "",
        "Empresa dominicana dedicada a consultoria tecnologica, desarrollo de software, implementacion de sistemas empresariales, integracion de plataformas, infraestructura tecnologica y soporte tecnico. Trabajamos con organizaciones publicas y privadas, desde el levantamiento de requerimientos hasta la capacitacion y el mantenimiento.",
        "",
        "## Datos generales",
        "",
        "| Campo | Valor |",
        "|---|---|",
        "| Razon social | " + COMPANY["legal_name"] + " |",
        "| Nombre comercial | " + COMPANY["trade_name"] + " |",
        "| RNC (ficticio) | " + COMPANY["rnc"] + " |",
        "| Registro mercantil | " + COMPANY["mercantile"] + " |",
        "| Fundada | 2020 (6 anos operando) |",
        "| Empleados | 12 |",
        "| Moneda operativa | DOP y USD |",
        "| Cobertura | Nacional, con capacidad de trabajo remoto |",
        "",
        "## Lineas de negocio",
        "",
        "- Desarrollo de software (web, movil, APIs, sistemas empresariales)",
        "- Consultoria IT (requerimientos, arquitectura, transformacion digital)",
        "- Integracion de sistemas, APIs y bases de datos",
        "- Infraestructura (servidores, redes)",
        "- Soporte tecnico (mesa de ayuda, preventivo y correctivo)",
        "- Suministro tecnologico mediante distribuidores",
        "- Cloud y capacitacion",
        "",
        "## Lo que deliberadamente NO somos",
        "",
        "- No somos Microsoft Solutions Partner.",
        "- No tenemos autorizacion directa de todos los fabricantes.",
        "- No fabricamos hardware ni operamos un centro de datos propio.",
        "- No contamos con certificaciones ISO empresariales.",
        "- No tenemos capacidad financiera ilimitada para contratos de gran volumen.",
        "",
        "*(Estas limitaciones son intencionales: permiten probar decisiones GO / GO con condiciones / NO-GO.)*",
        "",
        "## Experiencia resumida",
        "",
        "| Proyecto | Cliente (ficticio) | Monto |",
        "|---|---|---|",
        "| Sistema de Gestion Documental | Grupo Empresarial del Caribe | RD$2,450,000 |",
        "| Plataforma de Gestion de Inventario | Distribuidora Nacional del Este | RD$1,850,000 |",
        "| Aplicacion Movil de Servicios | Servicios Integrados del Cibao | RD$1,200,000 |",
        "| Infraestructura y Redes | Centro Empresarial del Norte | RD$980,000 |",
        "| Soporte y Mantenimiento | Soluciones Administrativas del Sur | RD$720,000 |",
    ]
    p = os.path.join(COMP, "DOC-CORP-001.md")
    open(p, "w").write("\n".join(lines))
    reg("DOC-CORP-001", 1, "md", "Perfil corporativo: capacidades, limites y experiencia resumida.")

def doc_team_csv():
    p = os.path.join(COMP, "DOC-TEAM-001.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["nombre", "cedula_ficticia", "posicion", "departamento"])
        for m in TEAM:
            w.writerow([m["name"], m["cedula"], m["position"], m["dept"]])
    reg("DOC-TEAM-001", 1, "csv", "Listado de los 12 integrantes del equipo.")

def doc_inventario_csv():
    p = os.path.join(COMP, "DOC-INV-001.csv")
    rows = [
        ("Laptop Dell Latitude 5440 (demo lab)", "8", "bueno", "Laboratorio de desarrollo"),
        ("Laptop Lenovo ThinkPad T14 (demo lab)", "4", "bueno", "Laboratorio de desarrollo"),
        ("Servidor de pruebas Dell PowerEdge T150", "2", "bueno", "Oficina principal"),
        ("Switch gestionable 24 puertos", "3", "bueno", "Oficina principal"),
        ("Access points WiFi 6", "6", "bueno", "Oficina principal"),
        ("Kit de herramientas de red", "2", "bueno", "Campo"),
        ("Impresora multifuncional", "1", "regular", "Oficina principal"),
        ("Vehiculo de servicio (camioneta)", "1", "bueno", "Operaciones"),
    ]
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["activo", "cantidad", "estado", "ubicacion"])
        w.writerows(rows)
    reg("DOC-INV-001", 3, "csv", "Inventario de equipos y capacidad operativa (ficticio).",
        gap="Inventario limitado: no hay stock de equipos para reventa a gran escala.")

for fn in [doc_registro_mercantil, doc_constancia_rnc, doc_estatutos, doc_certificacion_fiscal,
           doc_certificacion_tss, doc_perfil_corporativo, doc_team_csv, doc_inventario_csv]:
    fn()

# ============================================================ TANDA 2: EXPERIENCIA
CONTRACT_NO = {1: "CNT-2024-031", 2: "CNT-2023-012", 3: "CNT-2025-044", 4: "CNT-2022-019", 5: "CNT-2025-058"}

def doc_contrato(p, idx):
    d = new_doc(); d.add_page()
    n = idx + 1
    if n % 2 == 1:
        d.set_font("times", "B", 14); d.cell(0, 9, t("CONTRATO DE SERVICIOS TECNOLOGICOS"), ln=True, align="C")
        d.set_font("times", "", 10); d.cell(0, 7, t("Contrato No. " + CONTRACT_NO[n] + "  |  DOCUMENTO FICTICIO"), ln=True, align="C"); d.ln(4)
        d.set_font("times", "", 11)
        d.multi_cell(0, 6, t("ENTRE: " + p["client"] + " (EL CLIENTE, empresa ficticia), y " + COMPANY["legal_name"] + ", RNC " + COMPANY["rnc"] + " (EL PROVEEDOR, empresa ficticia)."))
        d.ln(2)
        claus = [("PRIMERA: Objeto.", p["title"] + ". " + p["desc"]),
                 ("SEGUNDA: Alcance.", "; ".join(p["scope"]) + "."),
                 ("TERCERA: Monto.", "El monto total del contrato es de " + money(p["value"]) + " (" + p["currency"] + ")."),
                 ("CUARTA: Plazo.", "Desde el " + p["start"] + " hasta el " + p["end"] + "."),
                 ("QUINTA: Tecnologias.", ", ".join(p["tech"]) + "."),
                 ("SEXTA: Naturaleza.", "Documento ficticio generado para la demostracion del Company Brain de Postor; sin valor contractual real.")]
    else:
        band(d, "CONTRATO DE PRESTACION DE SERVICIOS", 60, 60, 60)
        d.set_font("helvetica", "", 9); d.cell(0, 6, t("No. " + CONTRACT_NO[n] + " - DOCUMENTO FICTICIO DE DEMOSTRACION"), ln=True, align="C"); d.ln(3)
        d.set_font("helvetica", "B", 10); d.cell(45, 7, t("EL CLIENTE:")); d.set_font("helvetica", "", 10); d.cell(0, 7, t(p["client"] + " (ficticio)"), ln=True)
        d.set_font("helvetica", "B", 10); d.cell(45, 7, t("EL PROVEEDOR:")); d.set_font("helvetica", "", 10); d.cell(0, 7, t(COMPANY["legal_name"] + " (ficticio)"), ln=True)
        d.set_font("helvetica", "B", 10); d.cell(45, 7, t("OBJETO:")); d.set_font("helvetica", "", 10); d.multi_cell(0, 7, t(p["title"]), new_x="LMARGIN")
        d.ln(2)
        claus = [("1. Alcance.", "; ".join(p["scope"]) + "."),
                 ("2. Monto total.", money(p["value"]) + " " + p["currency"] + "."),
                 ("3. Vigencia.", p["start"] + " al " + p["end"] + "."),
                 ("4. Descripcion.", p["desc"]),
                 ("5. Nota.", "Documento ficticio sin valor legal; solo para la demo del Company Brain.")]
    for title, body in claus:
        d.set_font("times" if n % 2 == 1 else "helvetica", "B", 11)
        d.cell(0, 7, t(title), ln=True)
        d.set_font("times" if n % 2 == 1 else "helvetica", "", 11)
        d.multi_cell(0, 6, t(body)); d.ln(1)
    d.ln(6); d.set_font("helvetica", "", 9)
    d.cell(0, 6, t("Firma ficticia del cliente __________________      Firma ficticia del proveedor __________________"), ln=True, align="C")
    save(d, "DOC-CONTRACT-%03d" % n)
    reg("DOC-CONTRACT-%03d" % n, 2, "pdf", "Contrato del " + p["id"] + " (" + p["client"] + ", ficticio).")

INVOICES = [
    ("DOC-INVOICE-001", "F-2024-118", "2024-03-15", 0, 980000,  "Anticipo 40% - " + PROJECTS[0]["title"]),
    ("DOC-INVOICE-002", "F-2024-297", "2024-11-25", 0, 1470000, "Saldo 60% - " + PROJECTS[0]["title"]),
    ("DOC-INVOICE-003", "F-2023-086", "2023-05-10", 1, 1850000, "Pago unico - " + PROJECTS[1]["title"]),
    ("DOC-INVOICE-004", "F-2025-203", "2025-10-28", 2, 1200000, "Pago unico - " + PROJECTS[2]["title"]),
    ("DOC-INVOICE-005", "F-2022-141", "2022-12-15", 3, 980000,  "Pago unico - " + PROJECTS[3]["title"]),
    ("DOC-INVOICE-006", "F-2025-118", "2025-06-30", 4, 720000,  "Pago semestral - " + PROJECTS[4]["title"]),
]

def doc_factura(doc_id, f_no, f_date, pidx, amount, concept):
    p = PROJECTS[pidx]
    d = new_doc(); d.add_page()
    palettes = [(11, 58, 107), (0, 102, 102), (102, 51, 0), (60, 60, 60)]
    r, g, b = palettes[pidx % len(palettes)]
    band(d, COMPANY["trade_name"].upper() + " - FACTURA", r, g, b)
    d.set_font("helvetica", "", 9)
    d.cell(0, 6, t(COMPANY["legal_name"] + " (ficticia) | RNC " + COMPANY["rnc"] + " | " + COMPANY["address"]), ln=True, align="C")
    d.ln(3)
    for k, v in [("Factura No.:", f_no), ("Fecha:", f_date), ("Cliente (ficticio):", p["client"]),
                 ("RNC cliente (ficticio):", "131-9%04d-1" % (1000 + pidx * 137)), ("Proyecto:", p["title"])]:
        d.set_font("helvetica", "B", 10); d.cell(42, 7, t(k))
        d.set_font("helvetica", "", 10); d.cell(0, 7, t(v), ln=True)
    d.ln(3)
    d.set_fill_color(r, g, b); d.set_text_color(255, 255, 255); d.set_font("helvetica", "B", 10)
    d.cell(110, 8, t("Concepto"), fill=True); d.cell(35, 8, t("Monto"), fill=True, align="R"); d.ln()
    d.set_text_color(0, 0, 0); d.set_font("helvetica", "", 10)
    d.set_fill_color(245, 245, 245)
    d.cell(110, 8, t(concept), fill=True); d.cell(35, 8, money(amount), fill=True, align="R"); d.ln()
    d.set_font("helvetica", "B", 11); d.cell(110, 9, t("TOTAL"), align="R"); d.cell(35, 9, money(amount), align="R"); d.ln()
    d.ln(4); d.set_font("helvetica", "I", 9)
    d.multi_cell(0, 6, t("Factura ficticia con fines de demostracion. Vinculada al " + p["id"] + "."))
    save(d, doc_id)
    reg(doc_id, 2, "pdf", "Factura de " + p["id"] + " (" + money(amount) + ").")

ACCEPTANCES = [(1, "DOC-ACCEPTANCE-001", "2024-11-20"), (3, "DOC-ACCEPTANCE-003", "2025-10-22"), (4, "DOC-ACCEPTANCE-004", "2022-12-10")]

def doc_acta(pidx, doc_id, a_date):
    p = PROJECTS[pidx]; n = pidx + 1
    d = new_doc(); d.add_page()
    if n % 2 == 0:
        d.set_font("courier", "B", 13); d.cell(0, 9, t("ACTA DE RECEPCION Y ACEPTACION"), ln=True, align="C")
        d.set_font("courier", "", 9); d.cell(0, 6, t("DOCUMENTO FICTICIO"), ln=True, align="C"); d.ln(4)
        d.set_font("courier", "", 10)
        d.multi_cell(0, 6, t("En Santo Domingo, a los " + a_date + ", " + p["client"] + " (cliente ficticio) RECIBE A SATISFACCION los entregables del proyecto '" + p["title"] + "' ejecutado por " + COMPANY["legal_name"] + " (empresa ficticia), por un monto total de " + money(p["value"]) + "."))
    else:
        band(d, "ACTA DE ACEPTACION DE PROYECTO", 139, 69, 19)
        d.set_font("helvetica", "", 11)
        d.multi_cell(0, 7, t("El cliente ficticio " + p["client"] + " declara recibir conforme los trabajos del proyecto '" + p["title"] + "' (contrato " + CONTRACT_NO[n] + "), ejecutado por " + COMPANY["legal_name"] + ", en fecha " + a_date + ", por valor de " + money(p["value"]) + "."))
    d.ln(4); d.set_font("helvetica", "B", 10); d.cell(0, 7, t("Entregables verificados:"), ln=True)
    d.set_font("helvetica", "", 10)
    for s in p["scope"]:
        d.cell(0, 6, t("- " + s), ln=True)
    d.ln(6); d.set_font("helvetica", "", 9)
    d.cell(0, 6, t("Firma ficticia del cliente __________________      Firma ficticia del proveedor __________________"), ln=True, align="C")
    d.ln(3); d.set_font("helvetica", "I", 9)
    d.multi_cell(0, 6, t("Acta ficticia vinculada al " + p["id"] + "."))
    save(d, doc_id)
    reg(doc_id, 2, "pdf", "Acta de recepcion del " + p["id"] + ".")

def doc_referencia(doc_id, pidx, ref_no, r_date):
    p = PROJECTS[pidx]
    d = new_doc(); d.add_page()
    d.set_font("times", "B", 12); d.cell(0, 8, t(p["client"].upper() + " (FICTICIO)"), ln=True, align="C")
    d.set_font("times", "I", 10); d.cell(0, 7, t("Carta de referencia comercial - DOCUMENTO FICTICIO"), ln=True, align="C"); d.ln(4)
    d.set_font("times", "", 11)
    d.multi_cell(0, 7, t("A quien pueda interesar: por medio de la presente, " + p["client"] + " (empresa ficticia) hace constar que " + COMPANY["legal_name"] + " (empresa ficticia) ejecuto para nosotros el proyecto '" + p["title"] + "' por un monto de " + money(p["value"]) + ", con resultados satisfactorios."))
    d.ln(3)
    d.multi_cell(0, 7, t("Referencia No. " + ref_no + " | Fecha: " + r_date))
    d.ln(8); d.cell(0, 6, t("______________________________"), ln=True, align="C")
    d.set_font("times", "", 9); d.cell(0, 6, t("Firma ficticia - Representante del cliente (demo)"), ln=True, align="C")
    save(d, doc_id)
    reg(doc_id, 2, "pdf", "Referencia comercial del " + p["id"] + " (ficticia).")

for i, p in enumerate(PROJECTS):
    doc_contrato(p, i)
for doc_id, f_no, f_date, pidx, amount, concept in INVOICES:
    doc_factura(doc_id, f_no, f_date, pidx, amount, concept)
for pidx, doc_id, a_date in ACCEPTANCES:
    doc_acta(pidx, doc_id, a_date)
doc_referencia("DOC-REF-001", 0, "REF-2024-031", "2024-12-05")
doc_referencia("DOC-REF-002", 2, "REF-2025-077", "2025-11-03")

# ============================================ TANDAS 3 y 5: TECNICA + PROVEEDORES
CV_DATA = {
    "DOC-CV-001": ("Laura Isabel Mendez Torres", "Gerente de Proyectos",
        [("2019-actual", "Gerente de Proyectos - NovaTech Solutions, SRL (ficticia)"),
         ("2016-2019", "Coordinadora de Proyectos - Consultora ficticia ABC")],
        ["PMP (vigente)", "Scrum Master"], "Ingenieria de Sistemas, Univ. ficticia (2016)"),
    "DOC-CV-002": ("Rafael Eduardo Castillo Nunez", "Arquitecto de Software",
        [("2021-actual", "Arquitecto de Software - NovaTech Solutions, SRL (ficticia)"),
         ("2017-2021", "Desarrollador Senior - Empresa ficticia XYZ")],
        ["AWS Solutions Architect Associate (vigente)"], "Ingenieria de Software, Univ. ficticia (2017)"),
    "DOC-CV-003": ("Jose Miguel Duarte Pena", "Desarrollador Full-Stack",
        [("2022-actual", "Desarrollador Full-Stack - NovaTech Solutions, SRL (ficticia)"),
         ("2020-2022", "Desarrollador Junior - Startup ficticia")],
        [], "Tecnologo en Desarrollo de Software, Inst. ficticio (2020)"),
    "DOC-CV-004": ("Carla Maria Rosario Diaz", "Desarrolladora Full-Stack",
        [("2023-actual", "Desarrolladora Full-Stack - NovaTech Solutions, SRL (ficticia)")],
        ["Azure Administrator Associate (vigente)"], "Ingenieria de Sistemas, Univ. ficticia (2022)"),
    "DOC-CV-005": ("Carlos Daniel Reyes Santana", "Ingeniero de Infraestructura",
        [("2021-actual", "Ingeniero de Infraestructura - NovaTech Solutions, SRL (ficticia)"),
         ("2018-2021", "Tecnico de Redes - Empresa ficticia")],
        ["CCNA (VENCIDA jun-2025 - brecha deliberada)"], "Tecnologo en Redes, Inst. ficticio (2018)"),
    "DOC-CV-006": ("Yocasta Beltran Franco", "Analista de Sistemas",
        [("2023-actual", "Analista de Sistemas - NovaTech Solutions, SRL (ficticia)")],
        [], "Lic. en Informatica, Univ. ficticia (2022)"),
}

def doc_cv(doc_id):
    name, pos, exp, certs, edu = CV_DATA[doc_id]
    d = new_doc(); d.add_page()
    styles = {"DOC-CV-001": 0, "DOC-CV-002": 1, "DOC-CV-003": 0, "DOC-CV-004": 2, "DOC-CV-005": 1, "DOC-CV-006": 2}
    s = styles[doc_id]
    if s == 0:
        d.set_font("helvetica", "B", 16); d.cell(0, 10, t(name.upper()), ln=True)
        d.set_font("helvetica", "", 11); d.set_text_color(80, 80, 80)
        d.cell(0, 7, t(pos + " | CV FICTICIO DE DEMOSTRACION"), ln=True); d.set_text_color(0, 0, 0); d.ln(3)
    elif s == 1:
        band(d, name.upper(), 40, 40, 40)
        d.set_font("times", "I", 11); d.cell(0, 7, t(pos + " - curriculum ficticio"), ln=True, align="C"); d.ln(2)
    else:
        d.set_font("courier", "B", 13); d.cell(0, 8, t(name), ln=True, align="C")
        d.set_font("courier", "", 10); d.cell(0, 6, t(pos + " (CV ficticio)"), ln=True, align="C"); d.ln(3)
    sec = lambda x: (d.set_font("helvetica", "B", 11), d.cell(0, 7, t(x), ln=True), d.set_font("helvetica", "", 10))
    sec("Experiencia")
    for per, role in exp:
        d.cell(0, 6, t(per + "  |  " + role), ln=True)
    d.ln(2); sec("Educacion"); d.cell(0, 6, t(edu), ln=True)
    d.ln(2); sec("Certificaciones")
    if certs:
        for c in certs: d.cell(0, 6, t("- " + c), ln=True)
    else:
        d.set_font("helvetica", "I", 10); d.cell(0, 6, t("(Sin certificaciones registradas)"), ln=True)
    d.ln(2); d.set_font("helvetica", "I", 9)
    d.multi_cell(0, 6, t("CV ficticio con fines de demostracion. Datos personales inventados."))
    save(d, doc_id)
    reg(doc_id, 3, "pdf", "CV ficticio de " + name + ".",
        gap="CCNA vencida" if doc_id == "DOC-CV-005" else None)

def doc_cert(c):
    d = new_doc(); d.add_page()
    band(d, "CERTIFICADO PROFESIONAL (FICTICIO)", 139, 69, 19)
    d.ln(4); d.set_font("times", "B", 14)
    d.multi_cell(0, 8, t(c["title"]), align="C"); d.ln(2)
    d.set_font("times", "", 11); d.cell(0, 7, t("Otorgado a:"), ln=True, align="C")
    d.set_font("times", "B", 13); d.cell(0, 9, t(c["person"]), ln=True, align="C")
    d.set_font("times", "", 11); d.cell(0, 7, t("Entidad emisora (escenario ficticio): " + c["issuer"]), ln=True, align="C"); d.ln(2)
    for k, v in [("Fecha de emision:", c["issued"]), ("Fecha de vencimiento:", c["expires"]), ("Estado:", c["status"])]:
        d.set_font("helvetica", "B", 10); d.cell(55, 7, t(k), align="R")
        d.set_font("helvetica", "", 10); d.cell(0, 7, t(v), ln=True)
    d.ln(4); seal_box(d, "SELLO FICTICIO\n" + c["issuer"])
    save(d, c["id"])
    reg(c["id"], 3, "pdf", "Certificacion individual ficticia: " + c["title"] + ".",
        status=c["status"], gap="Certificacion VENCIDA el 2025-06-30" if c["id"] == "DOC-CERT-EXP-001" else None)

for c in CERTS:
    doc_cert(c)
for doc_id in CV_DATA:
    doc_cv(doc_id)

# ------------------------------------------------------------- TANDA 4: FINANCIERA
def doc_financiero(year, doc_id, revenue, assets, liabilities, equity, note):
    d = new_doc(); d.add_page()
    band(d, "ESTADOS FINANCIEROS " + str(year) + " (FICTICIOS)", 0, 90, 60)
    d.set_font("helvetica", "", 9); d.cell(0, 6, t(COMPANY["legal_name"] + " (ficticia) | RNC " + COMPANY["rnc"]), ln=True, align="C"); d.ln(2)
    d.set_font("helvetica", "B", 11); d.cell(0, 8, t("Balance General Resumido"), ln=True); d.set_font("helvetica", "", 10)
    for k, v in [("Activos totales", assets), ("Pasivos totales", liabilities), ("Patrimonio", equity)]:
        d.cell(90, 7, t(k)); d.cell(0, 7, money(v), ln=True, align="R")
    d.ln(2); d.set_font("helvetica", "B", 11); d.cell(0, 8, t("Estado de Resultados Resumido"), ln=True); d.set_font("helvetica", "", 10)
    for k, v in [("Ingresos operacionales", revenue), ("Utilidad neta estimada", revenue * 0.12)]:
        d.cell(90, 7, t(k)); d.cell(0, 7, money(v), ln=True, align="R")
    d.ln(2); d.set_font("helvetica", "B", 10); d.cell(0, 7, t("Indicadores"), ln=True); d.set_font("helvetica", "", 10)
    d.cell(90, 7, t("Liquidez corriente")); d.cell(0, 7, t("1.8"), ln=True, align="R")
    d.ln(3); d.set_font("helvetica", "I", 9)
    d.multi_cell(0, 6, t(note + " Cifras ficticias con fines de demostracion; sin valor contable real."))
    d.ln(6); d.set_font("helvetica", "", 9)
    d.cell(0, 6, t("Firma ficticia - Contador (demo) __________________"), ln=True, align="C")
    save(d, doc_id)
    reg(doc_id, 4, "pdf", "Estados financieros ficticios del ejercicio " + str(year) + ".",
        gap="Solo se dispone de 2024 y 2025; sin historico adicional." if year == 2025 else None)

doc_financiero(2024, "DOC-FIN-2024", 8400000, 6100000, 2400000, 3700000, "Ejercicio cerrado.")
doc_financiero(2025, "DOC-FIN-2025", 10200000, 7500000, 2800000, 4700000, "Ejercicio preliminar (ene-oct 2025).")

# ------------------------------------------------------------- TANDA 5: PROVEEDORES
QUOTS = [
    ("DOC-QUOT-001", "SUP-001", "TecnoSuministros del Caribe, SRL", "COT-2026-310", "2026-10-15", "2026-12-31",
     [("Laptop Lenovo ThinkPad T14 (i7, 16GB RAM, 512GB SSD)", 12, 68500),
      ("Laptop Dell Latitude 5440 (i5, 16GB RAM, 512GB SSD)", 8, 59200)],
     "vigente", None),
    ("DOC-QUOT-002", "SUP-002", "Redes y Conectividad RD, SRL", "COT-2026-142", "2026-05-01", "2026-06-30",
     [("Switch gestionable 24 puertos PoE", 6, 24800), ("Access point WiFi 6", 10, 9600)],
     "VENCIDA", "Cotizacion VENCIDA el 2026-06-30: precio historico, no vigente."),
    ("DOC-QUOT-003", "SUP-003", "Licencias y Software Empresarial LSE, SRL", "COT-2026-188", "2026-07-10", "2026-08-15",
     [("Microsoft 365 Business Standard (licencia anual)", 25, 9800),
      ("Windows Server 2022 Standard (licencia)", 2, 62000)],
     "VENCIDA", "Cotizacion VENCIDA el 2026-08-15. Ademas: una cotizacion NO equivale a autorizacion de fabricante."),
    ("DOC-QUOT-004", "SUP-004", "Componentes y Perifericos CP, SRL", "COT-2026-295", "2026-10-01", "2026-12-15",
     [("Laptop generica (Celeron, 4GB RAM, 128GB) - NO CUMPLE spec minima 8GB/256GB", 20, 21500)],
     "vigente", "Producto NO CUMPLE especificaciones minimas tipicas (4GB RAM < 8GB requeridos)."),
]

def doc_cotizacion(q):
    doc_id, sup_id, sup, qno, issued, valid, items, status, gap = q
    d = new_doc(); d.add_page()
    d.set_font("helvetica", "B", 12); d.cell(0, 8, t(sup.upper() + " (FICTICIO)"), ln=True, align="C")
    d.set_font("helvetica", "", 10); d.cell(0, 6, t("Cotizacion No. " + qno + " - DOCUMENTO FICTICIO"), ln=True, align="C"); d.ln(3)
    d.set_font("helvetica", "", 10)
    d.cell(0, 6, t("Para: " + COMPANY["legal_name"] + " (ficticia)"), ln=True)
    d.cell(0, 6, t("Fecha de emision: " + issued + "   |   Valida hasta: " + valid), ln=True)
    d.cell(0, 6, t("Estado: " + status), ln=True); d.ln(3)
    d.set_fill_color(11, 58, 107); d.set_text_color(255, 255, 255); d.set_font("helvetica", "B", 9)
    d.cell(95, 8, t("Descripcion"), fill=True); d.cell(18, 8, t("Cant."), fill=True, align="C")
    d.cell(32, 8, t("P. unit"), fill=True, align="R"); d.cell(35, 8, t("Subtotal"), fill=True, align="R"); d.ln()
    d.set_text_color(0, 0, 0); d.set_font("helvetica", "", 9); total = 0
    for i, (desc, qty, price) in enumerate(items):
        sub = qty * price; total += sub
        if i % 2: d.set_fill_color(245, 245, 245)
        else: d.set_fill_color(255, 255, 255)
        d.cell(95, 7, t(desc), fill=True); d.cell(18, 7, str(qty), fill=True, align="C")
        d.cell(32, 7, money(price), fill=True, align="R"); d.cell(35, 7, money(sub), fill=True, align="R"); d.ln()
    d.set_font("helvetica", "B", 10); d.cell(145, 8, t("TOTAL"), align="R"); d.cell(35, 8, money(total), align="R"); d.ln()
    d.ln(3); d.set_font("helvetica", "I", 9)
    note = "Cotizacion ficticia con fines de demostracion."
    if gap: note += " " + gap
    d.multi_cell(0, 6, t(note))
    save(d, doc_id)
    reg(doc_id, 5, "pdf", "Cotizacion de " + sup + " (" + status.lower() + ").", status=status, gap=gap)

for q in QUOTS:
    doc_cotizacion(q)

# ============================================================ JSONs DEL DATASET
def build_profile():
    caps = [
        {"id": "software_development", "label": "Desarrollo de software", "verification_level": "documented",
         "source": "Proyectos PROJECT-001, PROJECT-002, PROJECT-003 + facturas y actas", "relations": ["PROJECT-001", "PROJECT-002", "PROJECT-003"]},
        {"id": "it_consulting", "label": "Consultoria IT", "verification_level": "self_asserted_demo",
         "source": "Perfil corporativo DOC-CORP-001", "relations": ["DOC-CORP-001"]},
        {"id": "system_integration", "label": "Integracion de sistemas", "verification_level": "documented",
         "source": "Proyectos PROJECT-001, PROJECT-002", "relations": ["PROJECT-001", "PROJECT-002"]},
        {"id": "mobile_development", "label": "Desarrollo movil", "verification_level": "documented",
         "source": "Proyecto PROJECT-003", "relations": ["PROJECT-003"]},
        {"id": "network_infrastructure", "label": "Infraestructura y redes", "verification_level": "documented",
         "source": "Proyecto PROJECT-004", "relations": ["PROJECT-004"]},
        {"id": "technical_support", "label": "Soporte tecnico", "verification_level": "partially_documented",
         "source": "Proyecto PROJECT-004 + PROJECT-005 (sin acta de cierre)", "relations": ["PROJECT-004", "PROJECT-005"]},
        {"id": "technology_supply", "label": "Suministro tecnologico (via distribuidores)", "verification_level": "self_asserted_demo",
         "source": "Cotizaciones DOC-QUOT-001..004; sin autorizaciones de fabricante", "relations": ["DOC-QUOT-001", "DOC-QUOT-004"]},
        {"id": "cloud_services", "label": "Servicios cloud", "verification_level": "self_asserted_demo",
         "source": "Perfil corporativo DOC-CORP-001", "relations": ["DOC-CORP-001"]},
        {"id": "training", "label": "Capacitacion", "verification_level": "self_asserted_demo",
         "source": "Alcance de PROJECT-001", "relations": ["PROJECT-001"]},
    ]
    experience = []
    for p in PROJECTS:
        experience.append({
            "project_id": p["id"], "title": p["title"], "client_fictional": p["client"],
            "category": p["category"], "contract_value": p["value"], "currency": p["currency"],
            "start": p["start"], "end": p["end"], "technologies": p["tech"],
            "evidence_document_ids": p["evidence"],
            "verification_level": "documented" if p["has_acceptance"] else "partially_documented",
            "source": "Expediente del proyecto (" + ", ".join(p["evidence"]) + ")",
            "relations": {"capabilities": p["caps"], "gap": p["gap"]},
        })
    team = []
    cv_map = {"Laura Isabel Mendez Torres": "DOC-CV-001", "Rafael Eduardo Castillo Nunez": "DOC-CV-002",
              "Jose Miguel Duarte Pena": "DOC-CV-003", "Carla Maria Rosario Diaz": "DOC-CV-004",
              "Carlos Daniel Reyes Santana": "DOC-CV-005", "Yocasta Beltran Franco": "DOC-CV-006"}
    for m in TEAM:
        team.append({"name": m["name"], "cedula_fictional": m["cedula"], "position": m["position"],
                     "department": m["dept"], "cv_document_id": cv_map.get(m["name"]),
                     "verification_level": "documented" if m["name"] in cv_map else "self_asserted_demo",
                     "source": cv_map.get(m["name"], "Listado de personal DOC-TEAM-001")})
    profile = {
        "fictional": True,
        "notice": "DATOS 100% FICTICIOS - demo hackathon postor-meta-demo (Company Brain). Empresa, personas, clientes, documentos, cifras, RNC, cedulas y telefonos inventados. Cada documento fisico lleva la marca 'DOCUMENTO FICTICIO - MATERIAL DE DEMOSTRACION'.",
        "dataset_version": "novatech-v1",
        "company": {
            "legal_name": COMPANY["legal_name"], "commercial_name": COMPANY["trade_name"],
            "country": "DO", "company_type": "SRL", "company_size": "small",
            "founded": COMPANY["founded"], "years_in_operation": 6, "employee_count": 12,
            "rnc_fictional": COMPANY["rnc"], "mercantile_registry": COMPANY["mercantile"],
            "rpe_fictional": COMPANY["rpe"], "slogan": COMPANY["slogan"],
            "address": COMPANY["address"], "phones_fictional": COMPANY["phones"],
            "email": COMPANY["email"], "website": COMPANY["web"],
            "operating_currencies": ["DOP", "USD"], "coverage": "Nacional, con capacidad de trabajo remoto",
            "verification_level": "self_asserted_demo", "source": "DOC-LEGAL-001, DOC-LEGAL-002, DOC-CORP-001",
        },
        "capabilities": caps,
        "certifications": {
            "individual": [{"title": c["title"], "holder": c["person"], "issuer": c["issuer"],
                            "issued": c["issued"], "expires": c["expires"], "status": c["status"],
                            "document_id": c["id"], "verification_level": "documented",
                            "source": c["id"]} for c in CERTS],
            "manufacturer_authorizations": [],
            "company_certifications": [],
            "known_gaps": [
                "Sin acreditacion Microsoft Solutions Partner ni autorizacion directa de fabricantes (brecha deliberada).",
                "Sin certificaciones ISO empresariales (brecha deliberada).",
                "CCNA de Carlos Daniel Reyes Santana VENCIDA el 2025-06-30 (brecha deliberada).",
            ],
        },
        "experience": experience,
        "financial_profile": {
            "currency": "DOP",
            "annual_revenue": {"2024": 8400000, "2025": 10200000},
            "total_assets": 7500000, "total_liabilities": 2800000, "equity": 4700000,
            "current_liquidity": 1.8, "simultaneous_capacity": "2-3 proyectos medianos",
            "source": "DOC-FIN-2024, DOC-FIN-2025",
            "verification_level": "self_asserted_demo",
            "relations": {"gap": "Solo ejercicios 2024 y 2025 disponibles; sin historico adicional."},
            "note": "Un contrato de gran volumen (p. ej. RD$30M) representaria un riesgo financiero considerable para esta empresa.",
        },
        "team": team,
        "suppliers": [{"id": s["id"], "name": s["name"] + " (ficticio)", "line": s["line"],
                       "verification_level": "self_asserted_demo", "source": "DOC-QUOT-001..004",
                       "relations": {"quotations": [q[0] for q in QUOTS if q[1] == s["id"]],
                                     "manufacturer_authorization": None}} for s in SUPPLIERS],
        "compliance": {
            "dgii": {"status": "al dia (escenario ficticio)", "document_id": "DOC-LEGAL-004",
                     "issued": "2026-10-20", "expires": "2026-11-19", "verification_level": "documented"},
            "tss": {"status": "al dia (escenario ficticio)", "document_id": "DOC-LEGAL-005",
                    "issued": "2026-10-05", "expires": "2026-12-04", "verification_level": "documented"},
            "rnc": {"status": "activo (ficticio)", "document_id": "DOC-LEGAL-002", "verification_level": "documented"},
            "mercantile_registry": {"status": "vigente (ficticio)", "document_id": "DOC-LEGAL-001", "verification_level": "documented"},
        },
        "known_gaps_summary": [
            "Sin autorizacion Microsoft partner / fabricantes (NO-GO deliberado para licitaciones de licencias).",
            "Sin ISO empresariales.",
            "PROJECT-002 sin acta de recepcion (contrato + factura unicamente).",
            "PROJECT-005 sin acta de cierre (servicio en curso).",
            "2 cotizaciones vencidas (DOC-QUOT-002, DOC-QUOT-003).",
            "1 cotizacion con producto que no cumple especificaciones (DOC-QUOT-004).",
            "1 certificacion individual vencida (DOC-CERT-EXP-001).",
            "Estados financieros solo 2024-2025.",
            "Inventario operativo limitado, sin stock para reventa a gran escala.",
        ],
        "legal_representative": {"name": "Miguel Angel Peralta Cruz", "cedula_fictional": "001-0000000-2",
                                 "position": "Gerente General", "nationality": "Dominicano (ficticio)",
                                 "verification_level": "self_asserted_demo", "source": "DOC-LEGAL-001, DOC-LEGAL-003"},
    }
    p = os.path.join(ROOT, "company-profile.json")
    json.dump(profile, open(p, "w"), indent=2, ensure_ascii=False)
    return profile

def build_graph(profile):
    nodes, edges = [], []
    nodes.append({"id": "COMPANY", "type": "company", "label": COMPANY["legal_name"]})
    for c in profile["capabilities"]:
        nodes.append({"id": "CAP-" + c["id"].upper(), "type": "capability", "label": c["label"],
                      "verification_level": c["verification_level"]})
    for p in PROJECTS:
        nodes.append({"id": p["id"], "type": "project", "label": p["title"], "value": p["value"]})
        for cap in p["caps"]:
            edges.append({"from": p["id"], "to": "CAP-" + cap.upper(), "relation": "DEMONSTRATES"})
    for m in MANIFEST:
        nodes.append({"id": m["doc_id"], "type": "document", "kind": m["kind"],
                      "batch": m["batch"], "status": m["status"], "gap": m["gap"]})
        edges.append({"from": m["doc_id"], "to": "COMPANY", "relation": "BELONGS_TO"})
    for p in PROJECTS:
        for doc_id in p["evidence"]:
            edges.append({"from": doc_id, "to": p["id"], "relation": "EVIDENCES"})
    for c in CERTS:
        edges.append({"from": c["id"], "to": "COMPANY", "relation": "CERTIFIES_PERSON",
                      "person": c["person"], "status": c["status"]})
    for q in QUOTS:
        edges.append({"from": q[0], "to": q[1], "relation": "ISSUED_BY", "supplier": q[2], "status": q[7]})
    for cap in profile["capabilities"]:
        for rel in cap["relations"]:
            if rel.startswith("PROJECT"):
                edges.append({"from": "COMPANY", "to": "CAP-" + cap["id"].upper(), "relation": "HAS_CAPABILITY"})
                break
    g = {"fictional": True,
         "note": "Grafo de relaciones del Company Brain v1. DOCUMENTO -> PROYECTO -> CAPACIDAD. Una factura sin proyecto no prueba experiencia; el grafo lo hace explicito.",
         "nodes": nodes, "edges": edges}
    p = os.path.join(ROOT, "docs-graph.json")
    json.dump(g, open(p, "w"), indent=2, ensure_ascii=False)

def build_expected():
    scenarios = [
        {"id": "SC-01", "scenario": "Desarrollo de software a medida", "design_objective": "GO",
         "rationale": "PROJECT-001/002/003 documentan experiencia; actas disponibles para 001 y 003.",
         "requirement_states": {"experiencia_similar": "met", "equipo_tecnico": "met", "capacidad_financiera": "met", "documentacion_legal": "met"},
         "key_evidence": ["DOC-CONTRACT-001", "DOC-ACCEPTANCE-001", "DOC-INVOICE-001"], "known_gap": None},
        {"id": "SC-02", "scenario": "Implementacion de sistema de inventario", "design_objective": "GO_WITH_CONDITIONS",
         "rationale": "PROJECT-002 tiene contrato y factura pero NO tiene acta de recepcion.",
         "requirement_states": {"experiencia_similar": "met", "evidencia_de_aceptacion": "not_met", "equipo_tecnico": "met"},
         "key_evidence": ["DOC-CONTRACT-002", "DOC-INVOICE-003"], "known_gap": "Falta acta de recepcion del PROJECT-002."},
        {"id": "SC-03", "scenario": "Suministro de licencias Microsoft", "design_objective": "NO_GO",
         "rationale": "El pliego tipo exige acreditacion de partner; la empresa no la posee y una cotizacion no la sustituye.",
         "requirement_states": {"autorizacion_fabricante": "not_met", "experiencia_software": "met", "cotizacion_disponible": "met"},
         "key_evidence": ["DOC-QUOT-003"], "known_gap": "Sin Microsoft Solutions Partner ni autorizacion de fabricante."},
        {"id": "SC-04", "scenario": "Infraestructura de redes", "design_objective": "NEEDS_REVIEW",
         "rationale": "Hay experiencia (PROJECT-004) y proveedores, pero falta confirmar garantias y vigencia de cotizaciones.",
         "requirement_states": {"experiencia_redes": "met", "garantias": "unknown", "cotizacion_vigente": "unknown", "certificacion_personal": "not_met"},
         "key_evidence": ["DOC-CONTRACT-004", "DOC-QUOT-002"], "known_gap": "CCNA vencida; cotizacion de networking vencida."},
        {"id": "SC-05", "scenario": "Servicio de soporte tecnico", "design_objective": "GO_WITH_CONDITIONS",
         "rationale": "Personal suficiente, pero PROJECT-005 no tiene acta de cierre (servicio en curso).",
         "requirement_states": {"personal_soporte": "met", "experiencia_servicios": "met", "evidencia_de_cierre": "not_met"},
         "key_evidence": ["DOC-CONTRACT-005", "DOC-INVOICE-006", "DOC-TEAM-001"], "known_gap": "Sin acta de cierre del PROJECT-005."},
        {"id": "SC-06", "scenario": "Suministro de equipos a gran volumen", "design_objective": "NO_GO o NEEDS_REVIEW",
         "rationale": "Capacidad financiera limitada (patrimonio RD$4.7M) frente a un contrato de gran volumen; inventario sin stock de reventa.",
         "requirement_states": {"capacidad_financiera": "not_met", "inventario": "not_met", "proveedores": "met"},
         "key_evidence": ["DOC-FIN-2025", "DOC-INV-001"], "known_gap": "Patrimonio insuficiente para gran volumen; sin stock."},
        {"id": "SC-07", "scenario": "Consultoria tecnologica con certificacion individual exigida", "design_objective": "NEEDS_REVIEW",
         "rationale": "Si el pliego exige una certificacion individual especifica no encontrada, el estado debe ser unknown/needs_verification, no un descarte automatico.",
         "requirement_states": {"certificacion_especifica": "unknown", "experiencia_consultoria": "met"},
         "key_evidence": ["DOC-CERT-001", "DOC-CERT-002"], "known_gap": "Ausencia de evidencia != incumplimiento confirmado."},
    ]
    out = {"fictional": True,
           "warning": "OBJETIVOS DE DISENO - NO son decisiones finales sobre licitaciones especificas. Sirven para evaluar si los agentes razonan correctamente cuando se seleccionen procesos reales.",
           "requirement_states_legend": {"met": "requisito cumplido con evidencia", "not_met": "evidencia suficiente de incumplimiento",
                                        "unknown": "sin evidencia suficiente para concluir", "not_applicable": "no aplica al caso"},
           "scenarios": scenarios}
    p = os.path.join(EXP, "scenarios.json")
    json.dump(out, open(p, "w"), indent=2, ensure_ascii=False)

def build_manifest():
    batch_names = {1: "Identidad empresarial", 2: "Experiencia", 3: "Capacidad tecnica",
                   4: "Capacidad financiera", 5: "Proveedores"}
    m = {"fictional": True, "dataset": "novatech-v1",
         "company": COMPANY["legal_name"] + " (empresa ficticia)",
         "total_documents": len(MANIFEST),
         "batches": [{"batch": b, "name": batch_names[b],
                      "count": sum(1 for x in MANIFEST if x["batch"] == b),
                      "documents": [x["doc_id"] for x in MANIFEST if x["batch"] == b]} for b in range(1, 6)],
         "inventory": MANIFEST,
         "deliberate_gaps": [
            "Sin autorizacion Microsoft partner ni de fabricantes (manufacturer_authorizations vacio).",
            "Sin certificaciones ISO empresariales (company_certifications vacio).",
            "PROJECT-002 sin acta de recepcion.",
            "PROJECT-005 sin acta de cierre.",
            "DOC-QUOT-002 vencida (2026-06-30); DOC-QUOT-003 vencida (2026-08-15).",
            "DOC-QUOT-004: producto que no cumple especificaciones (4GB RAM).",
            "DOC-CERT-EXP-001: CCNA vencida (2025-06-30).",
            "Estados financieros solo 2024-2025.",
         ]}
    p = os.path.join(ROOT, "dataset-manifest.json")
    json.dump(m, open(p, "w"), indent=2, ensure_ascii=False)

profile = build_profile()
build_graph(profile)
build_expected()
build_manifest()
print("OK - documentos:", len(MANIFEST))
for b in range(1, 6):
    print("  tanda", b, "->", sum(1 for x in MANIFEST if x["batch"] == b))
