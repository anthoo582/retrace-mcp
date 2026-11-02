#!/usr/bin/env python3
"""Generate Retrace MCP documentation diagrams.

Single source of truth: the diagram models below. Each model is written twice:
  * docs/diagrams/<name>.drawio  (editable draw.io / diagrams.net source)
  * docs/diagrams/<name>.png     (2x raster used by the README)

Run: python scripts/build_diagrams.py
"""

from __future__ import annotations

import html
import math
import os
from dataclasses import dataclass, field
from typing import Literal

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "diagrams")
SCALE = 2

BG = "#0d1226"
PANEL = "#101a30"
CARD = "#141d38"
BORDER = "#2b3d63"
INK = "#f2f7ff"
MUTED = "#9fb0d0"
DIM = "#6f81a8"

MINT = "#59f2b0"
MINT_BG = "#122c27"
ORANGE = "#ff9a3d"
ORANGE_BG = "#2c2118"
YELLOW = "#ffd166"
YELLOW_BG = "#2b2717"
RED = "#ff6b6b"
RED_BG = "#2c171b"
CYAN = "#6ee7ff"
CYAN_BG = "#12222e"
PURPLE = "#b69cff"
PURPLE_BG = "#211a38"

STYLES = {
    "default": (CARD, BORDER),
    "mint": (MINT_BG, MINT),
    "orange": (ORANGE_BG, ORANGE),
    "yellow": (YELLOW_BG, YELLOW),
    "red": (RED_BG, RED),
    "cyan": (CYAN_BG, CYAN),
    "purple": (PURPLE_BG, PURPLE),
}

FONT_DIRS = [
    "C:/Windows/Fonts",
    "/usr/share/fonts/truetype/dejavu",
    "/Library/Fonts",
]
FONT_FILES = {
    "regular": ["segoeui.ttf", "DejaVuSans.ttf", "Arial.ttf"],
    "bold": ["segoeuib.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf"],
    "mono": ["consola.ttf", "DejaVuSansMono.ttf", "Courier New.ttf"],
    "monobold": ["consolab.ttf", "DejaVuSansMono-Bold.ttf", "Courier New Bold.ttf"],
}
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    key = (kind, size)
    if key in _font_cache:
        return _font_cache[key]
    for directory in FONT_DIRS:
        for name in FONT_FILES[kind]:
            path = os.path.join(directory, name)
            if os.path.exists(path):
                loaded = ImageFont.truetype(path, size * SCALE)
                _font_cache[key] = loaded
                return loaded
    loaded = ImageFont.load_default(size * SCALE)
    _font_cache[key] = loaded
    return loaded


@dataclass
class Node:
    id: str
    x: int
    y: int
    w: int
    h: int
    title: str = ""
    subtitle: str = ""
    bullets: list[str] = field(default_factory=list)
    kind: Literal["rect", "pill", "note", "group", "title"] = "rect"
    style: str = "default"
    align: Literal["center", "left"] = "center"
    mono: bool = False
    badge: str = ""
    title_size: int = 15
    sub_size: int = 12


@dataclass
class Edge:
    id: str
    from_id: str
    to_id: str
    points: list[tuple[int, int]]
    color: str = ORANGE
    label: str = ""
    dashed: bool = False
    both: bool = False
    arrow: bool = True


@dataclass
class Diagram:
    name: str
    title: str
    subtitle: str
    width: int
    height: int
    nodes: list[Node]
    edges: list[Edge]


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = current + " " + word
        if draw.textlength(candidate, font=fnt) <= max_width * SCALE:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_arrowhead(draw: ImageDraw.ImageDraw, tip: tuple[float, float], origin: tuple[float, float], color: str, size: float = 10) -> None:
    dx = tip[0] - origin[0]
    dy = tip[1] - origin[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    p1 = (tip[0] - ux * size + nx * size * 0.62, tip[1] - uy * size + ny * size * 0.62)
    p2 = (tip[0] - ux * size - nx * size * 0.62, tip[1] - uy * size - ny * size * 0.62)
    draw.polygon([(tip[0] * SCALE, tip[1] * SCALE), (p1[0] * SCALE, p1[1] * SCALE), (p2[0] * SCALE, p2[1] * SCALE)], fill=color)


def draw_dashed(draw: ImageDraw.ImageDraw, a: tuple[float, float], b: tuple[float, float], color: str, width: int, dash: float = 8.0) -> None:
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    pos = 0.0
    while pos < length:
        end = min(pos + dash, length)
        draw.line([((a[0] + ux * pos) * SCALE, (a[1] + uy * pos) * SCALE), ((a[0] + ux * end) * SCALE, (a[1] + uy * end) * SCALE)], fill=color, width=width * SCALE)
        pos = end + dash * 0.7


def point_along(points: list[tuple[int, int]], ratio: float = 0.5) -> tuple[float, float]:
    lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])]
    total = sum(lengths) or 1.0
    target = total * ratio
    acc = 0.0
    for (a, b), seg in zip(zip(points, points[1:]), lengths):
        if acc + seg >= target:
            t = (target - acc) / (seg or 1.0)
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        acc += seg
    return points[-1]


def render_edge(draw: ImageDraw.ImageDraw, edge: Edge) -> None:
    points = edge.points
    if edge.dashed:
        for a, b in zip(points, points[1:]):
            draw_dashed(draw, a, b, edge.color, 2)
    else:
        draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=edge.color, width=2 * SCALE, joint="curve")
    if edge.arrow and len(points) >= 2:
        draw_arrowhead(draw, points[-1], points[-2], edge.color)
        if edge.both:
            draw_arrowhead(draw, points[0], points[1], edge.color)
    if edge.label:
        mx, my = point_along(points, 0.5)
        fnt = font("regular", 10)
        lines = edge.label.split("\n")
        widths = [draw.textlength(line, font=fnt) / SCALE for line in lines]
        box_w = max(widths) + 12
        box_h = len(lines) * 13 + 6
        draw.rounded_rectangle(
            [((mx - box_w / 2) * SCALE), ((my - box_h / 2) * SCALE), ((mx + box_w / 2) * SCALE), ((my + box_h / 2) * SCALE)],
            radius=4 * SCALE,
            fill=BG,
        )
        for index, line in enumerate(lines):
            draw.text((mx * SCALE, (my - box_h / 2 + 3 + index * 13) * SCALE), line, font=fnt, fill=MUTED, anchor="ma")


def render_node(draw: ImageDraw.ImageDraw, node: Node) -> None:
    x, y, w, h = node.x, node.y, node.w, node.h
    box = [x * SCALE, y * SCALE, (x + w) * SCALE, (y + h) * SCALE]

    if node.kind == "title":
        draw.text((x * SCALE, y * SCALE), node.title, font=font("bold", 30), fill=INK, anchor="la")
        if node.subtitle:
            draw.text(((x + 2) * SCALE, (y + 42) * SCALE), node.subtitle, font=font("regular", 13), fill=MUTED, anchor="la")
        return

    fill, stroke = STYLES[node.style]

    if node.kind == "group":
        draw.rounded_rectangle(box, radius=14 * SCALE, fill=PANEL, outline=BORDER, width=1 * SCALE)
        draw.text(((x + 14) * SCALE, (y + 11) * SCALE), node.title.upper(), font=font("bold", 11), fill=DIM, anchor="la")
        return

    if node.kind == "pill":
        draw.rounded_rectangle(box, radius=(h / 2) * SCALE, fill=fill, outline=stroke, width=2 * SCALE)
    elif node.kind == "note":
        fold = 14
        draw.polygon(
            [
                (x * SCALE, y * SCALE),
                ((x + w - fold) * SCALE, y * SCALE),
                ((x + w) * SCALE, (y + fold) * SCALE),
                ((x + w) * SCALE, (y + h) * SCALE),
                (x * SCALE, (y + h) * SCALE),
            ],
            fill=fill,
            outline=stroke,
        )
        draw.line([((x + w - fold) * SCALE, y * SCALE), ((x + w - fold) * SCALE, (y + fold) * SCALE), ((x + w) * SCALE, (y + fold) * SCALE)], fill=stroke, width=2 * SCALE)
    else:
        draw.rounded_rectangle(box, radius=10 * SCALE, fill=fill, outline=stroke, width=2 * SCALE)

    if node.badge:
        badge_font = font("bold", 10)
        bw = draw.textlength(node.badge, font=badge_font) / SCALE + 14
        bh = 18
        bx = x + w - bw - 10
        by = y + 10
        draw.rounded_rectangle([bx * SCALE, by * SCALE, (bx + bw) * SCALE, (by + bh) * SCALE], radius=9 * SCALE, fill=stroke)
        draw.text(((bx + bw / 2) * SCALE, (by + bh / 2) * SCALE), node.badge, font=badge_font, fill=BG, anchor="mm")

    pad = 14
    max_text_w = w - pad * 2
    title_font = font("monobold" if node.mono else "bold", node.title_size)
    sub_font = font("mono" if node.mono else "regular", node.sub_size)
    bullet_font = font("mono" if node.mono else "regular", 10)

    blocks: list[tuple[str, object, str, int]] = []
    if node.title:
        for line in wrap(draw, node.title, title_font, max_text_w):
            blocks.append((line, title_font, INK, 19))
    if node.subtitle:
        for line in wrap(draw, node.subtitle, sub_font, max_text_w):
            blocks.append((line, sub_font, MUTED, 16))
    for bullet in node.bullets:
        for index, line in enumerate(wrap(draw, bullet, bullet_font, max_text_w - 10)):
            prefix = "• " if index == 0 else "  "
            blocks.append((prefix + line, bullet_font, MUTED, 14))

    total_h = sum(block[3] for block in blocks)
    top = y + (h - total_h) / 2
    if node.align == "left" or node.bullets:
        top = y + pad

    cursor = top
    for text, fnt, color, line_h in blocks:
        if node.align == "center" and not node.bullets:
            draw.text(((x + w / 2) * SCALE, cursor * SCALE), text, font=fnt, fill=color, anchor="ma")
        else:
            draw.text(((x + pad) * SCALE, cursor * SCALE), text, font=fnt, fill=color, anchor="la")
        cursor += line_h


def render(diagram: Diagram) -> Image.Image:
    image = Image.new("RGBA", (diagram.width * SCALE, diagram.height * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        [1 * SCALE, 1 * SCALE, (diagram.width - 1) * SCALE, (diagram.height - 1) * SCALE],
        radius=18 * SCALE,
        fill=BG,
        outline=BORDER,
        width=2 * SCALE,
    )
    for node in diagram.nodes:
        if node.kind in ("group", "title"):
            render_node(draw, node)
    for edge in diagram.edges:
        render_edge(draw, edge)
    for node in diagram.nodes:
        if node.kind not in ("group", "title"):
            render_node(draw, node)
    return image


def esc(value: str) -> str:
    return html.escape(value, quote=True).replace("\n", "<br>")


def xml_attr(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def drawio_style(node: Node) -> str:
    fill, stroke = STYLES[node.style]
    font_color = INK if node.style == "default" else stroke
    font_size = 14 if node.kind != "title" else 30
    if node.kind == "title":
        return f"text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;fontColor={INK};fontSize=30;fontStyle=1;"
    if node.kind == "group":
        return f"rounded=1;whiteSpace=wrap;html=1;fillColor={PANEL};strokeColor={BORDER};dashed=1;fontColor={DIM};fontSize=11;fontStyle=1;verticalAlign=top;align=left;spacingLeft=12;spacingTop=8;arcSize=4;"
    shape = ""
    if node.kind == "pill":
        shape = "rounded=1;arcSize=50;"
    elif node.kind == "note":
        shape = "shape=note;size=14;"
    else:
        shape = "rounded=1;arcSize=10;"
    font_style = 1 if node.mono else 0
    family = "monospace" if node.mono else "Helvetica"
    return (
        f"{shape}whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};strokeWidth=2;"
        f"fontColor={font_color};fontSize={font_size};fontStyle={font_style};fontFamily={family};"
        f"align={'left' if (node.align == 'left' or node.bullets) else 'center'};verticalAlign={'top' if node.bullets else 'middle'};spacing=10;"
    )


def drawio_value(node: Node) -> str:
    parts = []
    if node.badge:
        parts.append(f"<b>[{esc(node.badge)}]</b>")
    if node.title:
        parts.append(f"<b>{esc(node.title)}</b>" if node.kind != "group" else f"<b>{esc(node.title.upper())}</b>")
    if node.subtitle:
        parts.append(f"<font color='{MUTED}'>{esc(node.subtitle)}</font>")
    for bullet in node.bullets:
        parts.append(f"• {esc(bullet)}")
    return "<br>".join(parts)


def write_drawio(diagram: Diagram, path: str) -> None:
    cells: list[str] = []
    cells.append('<mxCell id="0"/>')
    cells.append('<mxCell id="1" parent="0"/>')
    for node in diagram.nodes:
        cells.append(
            f'<mxCell id="{node.id}" value="{xml_attr(drawio_value(node))}" style="{drawio_style(node)}" vertex="1" parent="1">'
            f'<mxGeometry x="{node.x}" y="{node.y}" width="{node.w}" height="{node.h}" as="geometry"/>'
            f'</mxCell>'
        )
    for edge in diagram.edges:
        waypoints = edge.points[1:-1]
        self_edge = edge.from_id == edge.to_id
        style = (
            f"edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor={edge.color};strokeWidth=2;"
            f"endArrow={'none' if (self_edge or not edge.arrow) else 'block'};endFill=1;"
            f"{'startArrow=block;startFill=1;' if edge.both else ''}"
            f"{'dashed=1;' if edge.dashed else ''}fontColor={MUTED};fontSize=10;labelBackgroundColor={BG};"
        )
        geometry = '<mxGeometry relative="1" as="geometry">'
        if self_edge:
            geometry += f'<mxPoint x="{edge.points[0][0]}" y="{edge.points[0][1]}" as="sourcePoint"/>'
            geometry += f'<mxPoint x="{edge.points[-1][0]}" y="{edge.points[-1][1]}" as="targetPoint"/>'
        elif waypoints:
            geometry += '<Array as="points">' + "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in waypoints) + "</Array>"
        geometry += "</mxGeometry>"
        endpoints = "" if self_edge else f' source="{edge.from_id}" target="{edge.to_id}"'
        cells.append(
            f'<mxCell id="{edge.id}" value="{xml_attr(esc(edge.label))}" style="{style}" edge="1" parent="1"{endpoints}>'
            f"{geometry}</mxCell>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<mxfile host="retrace-mcp" modified="2026-01-01T00:00:00.000Z">\n'
        f'  <diagram id="{diagram.name}" name="{esc(diagram.title)}">\n'
        f'    <mxGraphModel dx="{diagram.width}" dy="{diagram.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{diagram.width}" pageHeight="{diagram.height}" math="0" shadow="0">\n'
        "      <root>\n        " + "\n        ".join(cells) + "\n      </root>\n"
        "    </mxGraphModel>\n  </diagram>\n</mxfile>\n"
    )
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(xml)


def architecture() -> Diagram:
    nodes = [
        Node("clients", 40, 105, 1020, 92, title="Clientes MCP", kind="group"),
        Node("c-open", 64, 138, 300, 44, "OpenCode", "configs/opencode.json", style="cyan"),
        Node("c-claude", 400, 138, 300, 44, "Claude Code", "configs/claude.mcp.json", style="cyan"),
        Node("c-codex", 736, 138, 300, 44, "Codex", "configs/codex.config.toml", style="cyan"),
        Node("transport", 300, 228, 500, 66, "Transporte MCP", "src/index.ts · McpServer + StdioServerTransport", style="orange"),
        Node("sidecar", 40, 326, 230, 66, "Sidecar Python (opcional)", "capstone · pyelftools", style="mint"),
        Node("tools", 300, 326, 500, 66, "Registro de tools · 60", "src/tools/** · Zod + registerTool", style="orange", badge="60"),
        Node("external", 830, 326, 230, 66, "Analizadores externos", "binutils MIPS · radare2 · Ghidra", style="yellow"),
        Node("domain", 40, 430, 1020, 218, title="Dominio de análisis · puro, sin I/O de red", kind="group"),
        Node("d-parsers", 64, 468, 200, 64, "Parsers", "N64 ROM · ELF PS2", style="mint"),
        Node("d-mips", 280, 468, 180, 64, "MIPS", "R4300i · R5900", style="mint"),
        Node("d-memory", 476, 468, 170, 64, "Memoria", "regiones · crashes", style="mint"),
        Node("d-gfx", 662, 468, 170, 64, "Gráficos", "RDP · GS", style="mint"),
        Node("d-audio", 848, 468, 188, 64, "Audio", "VADPCM · VAG", style="mint"),
        Node("d-compare", 64, 548, 180, 64, "Comparación", "N64 ↔ PS2", style="mint"),
        Node("d-port", 260, 548, 180, 64, "Portabilidad", "plan · traducción", style="mint"),
        Node("d-graph", 456, 548, 170, 64, "Knowledge Graph", "nodos · aristas", style="mint"),
        Node("d-decomp", 642, 548, 170, 64, "Decomp config", "splat · validación", style="mint"),
        Node("d-build", 828, 548, 208, 64, "Build y reportes", "análisis · reportes", style="mint"),
        Node("infra", 40, 680, 1020, 80, title="Infraestructura y evidencia", kind="group"),
        Node("i-paths", 64, 710, 230, 38, "security/paths.ts", "", mono=True, title_size=13),
        Node("i-exec", 306, 710, 220, 38, "core/exec.ts", "", mono=True, title_size=13),
        Node("i-evidence", 538, 710, 220, 38, "core/evidence.ts", "", mono=True, title_size=13),
        Node("i-config", 770, 710, 266, 38, "config.ts + logger.ts", "", mono=True, title_size=13),
        Node("output", 280, 790, 540, 58, "Respuesta uniforme", "{ ok, data | error, evidence, limitations }", mono=True),
        Node("title", 40, 24, 900, 60, "Arquitectura de Retrace MCP", "Servidor TypeScript + sidecar Python · v0.7.0", kind="title"),
    ]
    edges = [
        Edge("e-clients", "clients", "transport", [(550, 197), (550, 228)], ORANGE),
        Edge("e-tools", "transport", "tools", [(550, 294), (550, 326)], ORANGE),
        Edge("e-sidecar", "tools", "sidecar", [(300, 359), (270, 359)], MINT, dashed=True),
        Edge("e-external", "tools", "external", [(800, 359), (830, 359)], YELLOW, dashed=True),
        Edge("e-domain", "tools", "domain", [(550, 392), (550, 430)], ORANGE),
        Edge("e-infra", "domain", "infra", [(550, 648), (550, 680)], ORANGE),
        Edge("e-output", "infra", "output", [(550, 760), (550, 790)], MINT, "toda salida lleva evidencia"),
    ]
    return Diagram("architecture", "Arquitectura de Retrace MCP", "Capas, límites y dependencias", 1100, 880, nodes, edges)


def request_flow() -> Diagram:
    labels = [
        ("Cliente MCP", "tools/call"),
        ("registerTool", "esquema Zod"),
        ("Rutas", "resolveInWorkspace"),
        ("Lectura", "readFileCapped"),
        ("Motor", "análisis puro"),
        ("Evidencia", "data + limitations"),
        ("Respuesta", "ok / fail(code)"),
    ]
    nodes: list[Node] = [
        Node("title", 40, 24, 900, 60, "Flujo de una tool y barreras de seguridad", "De la llamada MCP a la respuesta tipada", kind="title"),
    ]
    edges: list[Edge] = []
    for index, (name, sub) in enumerate(labels):
        x = 32 + index * 164
        node_id = f"step-{index + 1}"
        style = "cyan" if index == 0 else ("mint" if index >= 5 else "default")
        nodes.append(Node(node_id, x, 150, 150, 116, f"{index + 1} · {name}", sub, style=style))
        if index:
            edges.append(Edge(f"e-step-{index}", f"step-{index}", node_id, [(x - 14, 208), (x, 208)], ORANGE))
    nodes += [
        Node("guard", 35, 320, 1130, 280, title="Barreras de seguridad y política de escritura", kind="group"),
        Node("g-1", 55, 358, 360, 92, "Entrada inválida", "fail(code, message) · el esquema Zod se valida antes de tocar disco", style="red"),
        Node("g-2", 435, 358, 360, 92, "Ruta fuera de roots", "PATH_OUTSIDE_WORKSPACE · resolveInWorkspace rechaza", style="red"),
        Node("g-3", 815, 358, 330, 92, "Archivo demasiado grande", "RETRACE_MAX_FILE_BYTES · readFileCapped", style="orange"),
        Node("g-4", 55, 466, 360, 92, "Escritura", "RETRACE_ALLOW_WRITE=1 + apply/confirm + writeFileGuarded", style="orange"),
        Node("g-5", 435, 466, 360, 92, "Binario no confiable", "se analiza como dato; nunca se ejecuta", style="mint"),
        Node("g-6", 815, 466, 330, 92, "Herramienta ausente", "dependency_missing · jamás se simula", style="yellow"),
    ]
    return Diagram("request-flow", "Flujo de una tool", "Seguridad, límites y política de escritura", 1200, 640, nodes, edges)


def port_pipeline() -> Diagram:
    phases = [
        (
            "1 · Intake y validación",
            "requisitos y límites",
            "cyan",
            ["project_intake", "rom_validate", "toolchain_probe", "retrace_probe"],
        ),
        (
            "2 · Inspección binaria",
            "formato, secciones, símbolos",
            "mint",
            ["rom_inspect", "rom_identify_format", "rom_find_code_regions", "elf_inspect", "elf_list_symbols"],
        ),
        (
            "3 · Análisis y evidencia",
            "solo confirmed con prueba",
            "orange",
            ["mips_disassemble", "mips_analyze_function", "ghidra_import", "graph_ingest", "compare_functions", "equivalence_record"],
        ),
        (
            "4 · Traducción y proyecto",
            "escritura explícita",
            "purple",
            ["port_project_plan", "binary_translate", "generate_ps2_project", "decomp_config_apply_changes", "split_rom"],
        ),
        (
            "5 · Build y validación",
            "evidencia reproducible",
            "yellow",
            ["build_ps2", "build_run", "port_validate_translation", "emulator-hardware-validation", "generate_forensic_report"],
        ),
    ]
    nodes: list[Node] = [
        Node("title", 45, 24, 1100, 60, "Pipeline de portabilidad N64 → PS2", "Cinco fases, tres gates de evidencia, cero afirmaciones sin prueba", kind="title"),
    ]
    edges: list[Edge] = []
    for index, (name, sub, style, bullets) in enumerate(phases):
        x = 45 + index * 272
        node_id = f"phase-{index + 1}"
        nodes.append(Node(node_id, x, 140, 250, 150, name, sub, bullets=bullets, style=style, align="left"))
        if index:
            edges.append(Edge(f"e-phase-{index}", f"phase-{index}", node_id, [(x - 22, 215), (x, 215)], ORANGE))
    nodes.append(
        Node(
            "rule",
            45,
            325,
            1340,
            84,
            "Regla de oro",
            "Ninguna tool declara equivalencia semántica: confirmed solo se escribe con equivalence_record y evidencia. "
            "Toda escritura exige RETRACE_ALLOW_WRITE=1 + confirmación explícita. La similitud estructural no reemplaza "
            "la validación en emulador o hardware autorizado.",
            style="red",
            align="left",
        )
    )
    return Diagram("port-pipeline", "Pipeline N64 → PS2", "De ROM a proyecto PS2 validado", 1440, 435, nodes, edges)


def tool_map() -> Diagram:
    columns = [
        (
            "Entrada y contexto",
            [
                ("Sistema", "4", "probe · skills · limits"),
                ("Repositorio", "6", "inspect · search · references"),
                ("Intake y toolchains", "3", "project_intake · rom_validate"),
                ("Resumen", "60", "60 tools · 21 skills · salida tipada"),
            ],
        ),
        (
            "Binarios y ejecución",
            [
                ("N64 ROM", "4", "inspect · format · regions"),
                ("ELF PS2", "4", "sections · symbols · find"),
                ("MIPS", "3", "disassemble · analyze · reconstruct"),
                ("Memoria", "4", "regions · alignment · overlap"),
            ],
        ),
        (
            "Contenido y conocimiento",
            [
                ("Gráficos", "4", "texture · palette · decode"),
                ("Audio", "3", "inspect · VAG · VADPCM"),
                ("Decomp config", "4", "inspect · validate · apply"),
                ("Knowledge Graph", "4", "upsert · query · ingest"),
            ],
        ),
        (
            "Salida y automatización",
            [
                ("Comparación", "4", "functions · rank · equivalence"),
                ("Portabilidad", "3", "plan · translate · validate"),
                ("Build y reportes", "3", "build_analyze/run · report"),
                ("Orquestación MVP", "7", "analyze_n64_rom · ghidra_import"),
            ],
        ),
    ]
    nodes: list[Node] = [
        Node("title", 30, 24, 1000, 60, "Mapa de capacidades", "15 grupos · 60 tools MCP · 21 skills", kind="title"),
    ]
    for column_index, (heading, cards) in enumerate(columns):
        x = 30 + column_index * 295
        nodes.append(Node(f"head-{column_index}", x, 102, 275, 44, heading, style="orange"))
        for card_index, (name, count, tools) in enumerate(cards):
            y = 160 + card_index * 110
            style = "mint" if name == "Resumen" else "default"
            nodes.append(Node(f"card-{column_index}-{card_index}", x, y, 275, 96, name, tools, style=style, badge=count))
    nodes.append(Node("foot", 30, 620, 1160, 40, "Catálogo completo: docs/TOOLS.md · skills: docs/SKILLS.md", style="default", mono=True, title_size=12))
    return Diagram("tool-map", "Mapa de capacidades", "Subsistemas y cantidad de tools", 1220, 680, nodes, [])


def sequence() -> Diagram:
    participants = [
        ("Cliente MCP", "agente IA"),
        ("Servidor MCP", "src/index.ts"),
        ("Tool", "src/tools"),
        ("Seguridad", "paths / exec"),
        ("Motor", "dominio"),
        ("Disco", "solo lectura"),
        ("Sidecar", "opcional"),
    ]
    xs = [95 + index * 168 for index in range(len(participants))]
    nodes: list[Node] = [
        Node("title", 40, 24, 1000, 60, "Secuencia de una llamada MCP", "Validación, lectura acotada, análisis y respuesta con evidencia", kind="title"),
    ]
    for index, (name, sub) in enumerate(participants):
        x = xs[index] - 78
        style = "mint" if index == 0 else ("orange" if index == 1 else ("yellow" if index == 6 else "default"))
        nodes.append(Node(f"p-{index}", x, 105, 156, 54, name, sub, style=style, title_size=13, sub_size=10))
    edges: list[Edge] = []
    for index, x in enumerate(xs):
        edges.append(Edge(f"life-{index}", f"p-{index}", f"p-{index}", [(x, 159), (x, 712)], BORDER, dashed=True, arrow=False))
    messages = [
        (0, 1, "tools/call + args", ORANGE, False),
        (1, 2, "validar esquema Zod", MUTED, False),
        (2, 3, "resolveInWorkspace", CYAN, False),
        (3, 2, "ruta permitida", CYAN, True),
        (2, 5, "readFileCapped", MUTED, False),
        (5, 2, "bytes ≤ límite", MUTED, True),
        (2, 4, "analizar(entrada)", ORANGE, False),
        (4, 6, "JSON-RPC opcional", YELLOW, False),
        (6, 4, "resultado |\ndependency_missing", YELLOW, True),
        (4, 2, "data + evidence\n+ limitations", MINT, True),
        (2, 1, "ok(data) |\nfail(code)", MINT, True),
        (1, 0, "resultado MCP", ORANGE, True),
    ]
    for index, (source, target, label, color, dashed) in enumerate(messages):
        y = 210 + index * 44
        edges.append(Edge(f"msg-{index}", f"p-{source}", f"p-{target}", [(xs[source], y), (xs[target], y)], color, label, dashed))
    return Diagram("sequence", "Secuencia MCP", "Una llamada, siete participantes, evidencia al final", 1200, 760, nodes, edges)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    diagrams = [architecture(), request_flow(), port_pipeline(), tool_map(), sequence()]
    for diagram in diagrams:
        render(diagram).save(os.path.join(OUT_DIR, f"{diagram.name}.png"))
        write_drawio(diagram, os.path.join(OUT_DIR, f"{diagram.name}.drawio"))
        print(f"wrote {diagram.name}.png and {diagram.name}.drawio")


if __name__ == "__main__":
    main()
