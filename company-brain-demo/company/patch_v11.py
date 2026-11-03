#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parche v1.1 del dataset NovaTech: ajuste fino contra las 4 licitaciones REALES.
- DOC-CV-004 (Carla): experiencia demostrable en Azure, Nube y DevOps (caso A/CNE).
- PROJECT-004: alcance Wi-Fi (14 AP Wi-Fi 6) -> DOC-CONTRACT-004, DOC-INVOICE-005, DOC-ACCEPTANCE-004 (caso B/INDOTEL).
- DOC-LEGAL-006 (nuevo): constancia RPE ficticia (caso A/CNE exige RPE activo).
- company-profile.json: P004 (tech/desc), compliance.rpe.
- dataset-manifest.json + docs-graph.json: alta del DOC-LEGAL-006.
- expected-results/scenarios.json: reescrito con los 4 casos reales.
Todo sigue siendo 100% ficticio y marcado como demo.
"""
import json, os
from fpdf import FPDF

ROOT = os.path.expanduser("~/workspace/company-brain-build/novatech")
COMP = os.path.join(ROOT, "company")

def t(s):
    return (s.replace("\u2014", "-").replace("\u2013", "-")
             .replace("\u00b7", "-").replace("\u201c", '"').replace("\u201d", '"')
             .replace("\u2018", "'").replace("\u2019", "'").replace("\u2026", "...")
             .replace("\u20ac", "EUR").replace("\u2713", "OK"))

WM = t("DOCUMENTO FICTICIO - MATERIAL DE DEMOSTRACION | NovaTech Solutions, SRL (empresa ficticia)")

COMPANY = {"legal_name": "NovaTech Solutions, SRL", "trade_name": "NovaTech",
           "rnc": "131-48271-9", "rpe": "882145",
           "address": "Av. Tiradentes 456, Naco, Santo Domingo, Rep. Dom."}

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
    d.set_fill_color(r, g, b); d.set_text_color(255, 255, 255)
    d.set_font("helvetica", "B", 13)
    d.cell(0, 10, t(text), ln=True, fill=True, align="C")
    d.set_text_color(0, 0, 0); d.ln(3)

def money(n):
    return "RD$ {:,.2f}".format(n)

def save(d, doc_id):
    path = os.path.join(COMP, doc_id + ".pdf")
    d.output(path); return path

# ============ 1. CV Carla (DOC-CV-004, estilo 2 = courier) ============
name, pos = "Carla Maria Rosario Diaz", "Desarrolladora Full-Stack"
exp = [("2023-actual", "Desarrolladora Full-Stack - NovaTech Solutions, SRL (ficticia): despliegue de aplicaciones en Microsoft Azure (App Services, Azure SQL Database) y pipelines CI/CD con Azure DevOps"),
       ("2021-2023", "Desarrolladora de Software - Empresa ficticia del Este: desarrollo web y automatizacion de despliegues en entornos de nube")]
certs = ["Azure Administrator Associate (vigente)"]
edu = "Ingenieria de Sistemas, Univ. ficticia (2022)"
d = new_doc(); d.add_page()
d.set_font("courier", "B", 13); d.cell(0, 8, t(name), ln=True, align="C")
d.set_font("courier", "", 10); d.cell(0, 6, t(pos + " (CV ficticio)"), ln=True, align="C"); d.ln(3)
sec = lambda x: (d.set_font("helvetica", "B", 11), d.cell(0, 7, t(x), ln=True), d.set_font("helvetica", "", 10))
sec("Experiencia")
for per, role in exp:
    d.set_font("helvetica", "B", 10)
    d.multi_cell(0, 6, t(per + " | " + role), new_x="LMARGIN", new_y="NEXT")
d.ln(2); sec("Educacion"); d.cell(0, 6, t(edu), ln=True)
d.ln(2); sec("Certificaciones")
for c in certs: d.cell(0, 6, t("- " + c), ln=True)
d.ln(2); d.set_font("helvetica", "I", 9)
d.multi_cell(0, 6, t("CV ficticio con fines de demostracion. Datos personales inventados."))
save(d, "DOC-CV-004")
print("regen DOC-CV-004 (Azure/DevOps)")

# ============ 2. PROJECT-004 con alcance Wi-Fi ============
P4 = dict(id="PROJECT-004", title="Infraestructura y Redes",
         client="Centro Empresarial del Norte", start="2022-05-09", end="2022-12-10",
         value=980000, currency="DOP",
         desc="Configuracion de infraestructura de red, instalacion y puesta en servicio de 14 access points Wi-Fi 6, estaciones de trabajo y soporte tecnico.",
         tech=["Cisco", "Ubiquiti UniFi", "Wi-Fi 6", "Windows Server"],
         scope=["Instalacion y configuracion de 14 access points Wi-Fi 6",
                "Equipos de networking y cableado estructurado",
                "Mantenimiento preventivo",
                "Documentacion tecnica"])
# Contrato (n=4 -> layout par/helvetica)
d = new_doc(); d.add_page()
band(d, "CONTRATO DE PRESTACION DE SERVICIOS", 60, 60, 60)
d.set_font("helvetica", "", 9); d.cell(0, 6, t("No. CNT-2022-019 - DOCUMENTO FICTICIO DE DEMOSTRACION"), ln=True, align="C"); d.ln(3)
d.set_font("helvetica", "B", 10); d.cell(45, 7, t("EL CLIENTE:")); d.set_font("helvetica", "", 10); d.cell(0, 7, t(P4["client"] + " (ficticio)"), ln=True)
d.set_font("helvetica", "B", 10); d.cell(45, 7, t("EL PROVEEDOR:")); d.set_font("helvetica", "", 10); d.cell(0, 7, t(COMPANY["legal_name"] + " (ficticio)"), ln=True)
d.set_font("helvetica", "B", 10); d.cell(45, 7, t("OBJETO:")); d.set_font("helvetica", "", 10); d.multi_cell(0, 7, t(P4["title"]), new_x="LMARGIN")
d.ln(2)
for title, body in [("1. Alcance.", "; ".join(P4["scope"]) + "."),
                    ("2. Monto total.", money(P4["value"]) + " " + P4["currency"] + "."),
                    ("3. Vigencia.", P4["start"] + " al " + P4["end"] + "."),
                    ("4. Descripcion.", P4["desc"]),
                    ("5. Nota.", "Documento ficticio sin valor legal; solo para la demo del Company Brain.")]:
    d.set_font("helvetica", "B", 11); d.cell(0, 7, t(title), ln=True)
    d.set_font("helvetica", "", 11); d.multi_cell(0, 6, t(body)); d.ln(1)
d.ln(6); d.set_font("helvetica", "", 9)
d.cell(0, 6, t("Firma ficticia del cliente __________________      Firma ficticia del proveedor __________________"), ln=True, align="C")
save(d, "DOC-CONTRACT-004")
print("regen DOC-CONTRACT-004 (Wi-Fi 14 AP)")
# Factura
d = new_doc(); d.add_page()
band(d, "NOVATECH - FACTURA", 60, 60, 60)
d.set_font("helvetica", "", 9)
d.cell(0, 6, t(COMPANY["legal_name"] + " (ficticia) | RNC " + COMPANY["rnc"] + " | " + COMPANY["address"]), ln=True, align="C"); d.ln(3)
for k, v in [("Factura No.:", "F-2022-141"), ("Fecha:", "2022-12-15"), ("Cliente (ficticio):", P4["client"]),
             ("RNC cliente (ficticio):", "131-91411-1"), ("Proyecto:", P4["title"])]:
    d.set_font("helvetica", "B", 10); d.cell(42, 7, t(k))
    d.set_font("helvetica", "", 10); d.cell(0, 7, t(v), ln=True)
d.ln(3); d.set_fill_color(60, 60, 60); d.set_text_color(255, 255, 255); d.set_font("helvetica", "B", 10)
d.cell(110, 8, t("Concepto"), fill=True); d.cell(35, 8, t("Monto"), fill=True, align="R"); d.ln()
d.set_text_color(0, 0, 0); d.set_font("helvetica", "", 10); d.set_fill_color(245, 245, 245)
concept = "Pago unico - " + P4["title"] + " (14 AP Wi-Fi 6)"
d.cell(110, 8, t(concept), fill=True); d.cell(35, 8, money(P4["value"]), fill=True, align="R"); d.ln()
d.set_font("helvetica", "B", 11); d.cell(110, 9, t("TOTAL"), align="R"); d.cell(35, 9, money(P4["value"]), align="R"); d.ln()
d.ln(4); d.set_font("helvetica", "I", 9)
d.multi_cell(0, 6, t("Factura ficticia con fines de demostracion. Vinculada al PROJECT-004."))
save(d, "DOC-INVOICE-005")
print("regen DOC-INVOICE-005")
# Acta (n=4 -> layout par/courier)
d = new_doc(); d.add_page()
d.set_font("courier", "B", 13); d.cell(0, 9, t("ACTA DE RECEPCION Y ACEPTACION"), ln=True, align="C")
d.set_font("courier", "", 9); d.cell(0, 6, t("DOCUMENTO FICTICIO"), ln=True, align="C"); d.ln(4)
d.set_font("courier", "", 10)
d.multi_cell(0, 6, t("En Santo Domingo, a los 2022-12-10, " + P4["client"] + " (cliente ficticio) RECIBE A SATISFACCION los entregables del proyecto '" + P4["title"] + "' ejecutado por " + COMPANY["legal_name"] + " (empresa ficticia), por un monto total de " + money(P4["value"]) + "."))
d.ln(4); d.set_font("helvetica", "B", 10); d.cell(0, 7, t("Entregables verificados:"), ln=True)
d.set_font("helvetica", "", 10)
for s in P4["scope"]:
    d.cell(0, 6, t("- " + s), ln=True)
d.ln(6); d.set_font("helvetica", "", 9)
d.cell(0, 6, t("Firma ficticia del cliente __________________      Firma ficticia del proveedor __________________"), ln=True, align="C")
d.ln(3); d.set_font("helvetica", "I", 9)
d.multi_cell(0, 6, t("Acta ficticia vinculada al PROJECT-004."))
save(d, "DOC-ACCEPTANCE-004")
print("regen DOC-ACCEPTANCE-004")

# ============ 3. DOC-LEGAL-006: constancia RPE ficticia ============
d = new_doc(); d.add_page()
band(d, "CONSTANCIA DE REGISTRO DE PROVEEDORES DEL ESTADO")
d.set_font("helvetica", "", 10)
d.cell(0, 7, t("Direccion General de Contrataciones Publicas (DGCP) - DOCUMENTO FICTICIO"), ln=True, align="C")
d.ln(4); d.set_fill_color(235, 240, 248)
rows = [("RPE", COMPANY["rpe"] + " (ficticio)"), ("Razon social", COMPANY["legal_name"]),
        ("RNC", COMPANY["rnc"]), ("Tipo de proveedor", "Persona Juridica - MIPYME (escenario ficticio)"),
        ("Estado", "ACTIVO"), ("Fecha de emision", "10/01/2026"), ("Vigencia", "1 ano")]
for i, (k, v) in enumerate(rows):
    fill = i % 2 == 0
    d.set_font("helvetica", "B", 10); d.cell(60, 8, t(k), fill=fill)
    d.set_font("helvetica", "", 10); d.cell(0, 8, t(v), ln=True, fill=fill)
d.ln(4); d.set_font("helvetica", "I", 9)
d.multi_cell(0, 6, t("Documento ficticio generado para la demo Company Brain. No constituye una constancia real de la DGCP."))
save(d, "DOC-LEGAL-006")
print("nuevo DOC-LEGAL-006 (RPE)")

# ============ 4. company-profile.json ============
pp = os.path.join(ROOT, "company-profile.json")
p = json.load(open(pp, encoding="utf-8"))
for e in p["experience"]:
    if e["project_id"] == "PROJECT-004":
        e["technologies"] = ["Cisco", "Ubiquiti UniFi", "Wi-Fi 6", "Windows Server"]
        e["scope_summary"] = ("Instalacion y configuracion de 14 access points Wi-Fi 6, "
                              "equipos de networking y cableado estructurado, mantenimiento preventivo y documentacion tecnica.")
        e["source"] = "Expediente del proyecto (DOC-CONTRACT-004, DOC-INVOICE-005, DOC-ACCEPTANCE-004) - alcance Wi-Fi verificado en contrato y acta."
p["compliance"]["rpe"] = {
    "status": "activo (ficticio)", "number": COMPANY["rpe"],
    "document_id": "DOC-LEGAL-006", "issued": "2026-01-10",
    "verification_level": "documented",
    "source": "DOC-LEGAL-006"
}
gaps = p.get("known_gaps_summary", [])
if not any("RPE" in g for g in gaps):
    pass  # RPE ya no es brecha
json.dump(p, open(pp, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("company-profile.json actualizado (P004 + rpe)")

# ============ 5. dataset-manifest.json ============
mp = os.path.join(ROOT, "dataset-manifest.json")
m = json.load(open(mp, encoding="utf-8"))
def add_doc(obj):
    if isinstance(obj, dict):
        if obj.get("batch") == 1 and "documents" in obj:
            if "DOC-LEGAL-006" not in obj["documents"]:
                obj["documents"].append("DOC-LEGAL-006")
                obj["count"] = len(obj["documents"])
        for v in obj.values(): add_doc(v)
    elif isinstance(obj, list):
        for v in obj: add_doc(v)
add_doc(m)
json.dump(m, open(mp, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("dataset-manifest.json actualizado")

# ============ 6. docs-graph.json ============
gp = os.path.join(ROOT, "docs-graph.json")
g = json.load(open(gp, encoding="utf-8"))
if not any(n["id"] == "DOC-LEGAL-006" for n in g["nodes"]):
    g["nodes"].append({"id": "DOC-LEGAL-006", "type": "document", "kind": "pdf", "batch": 1, "status": "vigente", "gap": None})
    g["edges"].append({"from": "DOC-LEGAL-006", "to": "COMPANY", "relation": "BELONGS_TO"})
json.dump(g, open(gp, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("docs-graph.json actualizado")

print("Parche v1.1 aplicado.")
