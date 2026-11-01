"""Herramientas de análisis de memoria y crash forensics."""

from __future__ import annotations

from ..errors import ValidationError
from ..parsers import memory as mem_parser
from ..registry import tool
from ..security import read_bytes, require_readable


@tool
def memory_analyze_dump(
    path: str, base_address: int = 0, endian: str = "little", format: str = "raw"
) -> dict:
    """Analiza un dump binario de memoria.

    Args:
        path: Archivo del dump.
        base_address: Dirección virtual base (0 si se desconoce).
        endian: 'big' (N64) o 'little' (PS2).
        format: 'raw' (binario puro) o futuro soporte para otros formatos.

    Returns:
        Resumen del dump: tamaño, dirección base, estadísticas.
    """
    require_readable(path)
    data = read_bytes(path)

    dump = mem_parser.MemoryDump(data, base_address)

    # Estadísticas básicas
    zero_count = data.count(b"\x00")
    ff_count = data.count(b"\xff")

    return {
        "file": path,
        "size_bytes": dump.size,
        "base_address": hex(base_address),
        "endian": endian,
        "format": format,
        "statistics": {
            "zero_bytes": zero_count,
            "zero_percent": round(100 * zero_count / dump.size, 2) if dump.size > 0 else 0,
            "ff_bytes": ff_count,
            "ff_percent": round(100 * ff_count / dump.size, 2) if dump.size > 0 else 0,
        },
    }


@tool
def memory_inspect_region(
    path: str, offset: int, size: int, base_address: int = 0, endian: str = "little"
) -> dict:
    """Inspecciona una región específica de un dump de memoria.

    Args:
        path: Archivo del dump.
        offset: Offset en bytes dentro del dump.
        size: Número de bytes a inspeccionar.
        base_address: Dirección virtual base del dump.
        endian: 'big' o 'little'.

    Returns:
        Datos de la región: bytes hex, interpretación como uint32s, strings.
    """
    require_readable(path)
    data = read_bytes(path)

    if offset < 0 or offset >= len(data):
        raise ValidationError(f"Offset fuera de rango: {offset} (dump size: {len(data)})")
    if size <= 0 or size > 16384:  # Límite razonable
        raise ValidationError(f"Tamaño inválido: {size} (máx 16KB)")

    dump = mem_parser.MemoryDump(data, base_address)
    region = dump.read_bytes(offset, min(size, len(data) - offset))

    # Interpretación como uint32s
    u32s: list[str] = []
    for i in range(0, len(region), 4):
        if i + 4 <= len(region):
            chunk = region[i : i + 4]
            val = int.from_bytes(chunk, endian)
            u32s.append(hex(val))

    # Búsqueda de strings ASCII
    strings: list[str] = []
    current = []
    for byte in region:
        if 0x20 <= byte <= 0x7E:  # ASCII imprimible
            current.append(chr(byte))
        else:
            if len(current) >= 4:  # Mínimo 4 chars para considerar string
                strings.append("".join(current))
            current = []
    if len(current) >= 4:
        strings.append("".join(current))

    return {
        "offset": offset,
        "size": len(region),
        "virtual_address": hex(base_address + offset) if base_address else None,
        "endian": endian,
        "hex": region[:256].hex() if len(region) > 256 else region.hex(),
        "truncated": len(region) > 256,
        "uint32s": u32s[:64],  # Máx 64 valores
        "strings": strings[:20],  # Máx 20 strings
    }


@tool
def memory_find_pointer(
    path: str, target_address: int, base_address: int = 0, endian: str = "little", max_results: int = 100
) -> dict:
    """Busca referencias a una dirección (punteros) en un dump de memoria.

    Args:
        path: Archivo del dump.
        target_address: Dirección a buscar.
        base_address: Dirección virtual base del dump.
        endian: 'big' o 'little'.
        max_results: Máximo de resultados.

    Returns:
        Lista de offsets donde se encontró la dirección.
    """
    require_readable(path)
    data = read_bytes(path)

    # Convertir dirección a bytes
    target_bytes = target_address.to_bytes(4, endian)

    dump = mem_parser.MemoryDump(data, base_address)
    offsets = dump.find_pattern(target_bytes, max_results=max_results)

    return {
        "target_address": hex(target_address),
        "dump_size": len(data),
        "base_address": hex(base_address),
        "endian": endian,
        "found_count": len(offsets),
        "truncated": len(offsets) >= max_results,
        "references": [
            {
                "offset": off,
                "virtual_address": hex(base_address + off) if base_address else None,
            }
            for off in offsets
        ],
    }


@tool
def memory_check_alignment(address: int, alignment: int = 4) -> dict:
    """Verifica si una dirección está correctamente alineada.

    Args:
        address: Dirección a verificar.
        alignment: Alineación requerida (default: 4 bytes para MIPS).

    Returns:
        Resultado de la verificación y offset de misalignment.
    """
    if alignment <= 0 or alignment > 64:
        raise ValidationError(f"Alineación inválida: {alignment}")

    is_aligned = (address % alignment) == 0
    offset = address % alignment

    return {
        "address": hex(address),
        "alignment": alignment,
        "is_aligned": is_aligned,
        "offset": offset if not is_aligned else 0,
        "next_aligned": hex(address + (alignment - offset) if not is_aligned else address),
    }


@tool
def memory_analyze_overlap(
    region1_start: int, region1_size: int, region2_start: int, region2_size: int
) -> dict:
    """Detecta si dos regiones de memoria se superponen.

    Args:
        region1_start: Dirección de inicio de la región 1.
        region1_size: Tamaño de la región 1.
        region2_start: Dirección de inicio de la región 2.
        region2_size: Tamaño de la región 2.

    Returns:
        Análisis de superposición con detalles del overlap.
    """
    r1_end = region1_start + region1_size
    r2_end = region2_start + region2_size

    overlaps = not (r1_end <= region2_start or r2_end <= region1_start)

    overlap_start = max(region1_start, region2_start) if overlaps else None
    overlap_end = min(r1_end, r2_end) if overlaps else None
    overlap_size = (overlap_end - overlap_start) if overlaps and overlap_start and overlap_end else 0

    return {
        "region1": {"start": hex(region1_start), "end": hex(r1_end), "size": region1_size},
        "region2": {"start": hex(region2_start), "end": hex(r2_end), "size": region2_size},
        "overlaps": overlaps,
        "overlap": (
            {
                "start": hex(overlap_start),
                "end": hex(overlap_end),
                "size": overlap_size,
            }
            if overlaps
            else None
        ),
    }


@tool
def crash_analyze(crash_log: str, arch: str = "r5900") -> dict:
    """Analiza un crash log y extrae información de debugging.

    Args:
        crash_log: Contenido del log de crash (texto).
        arch: Arquitectura ('r4300i' para N64, 'r5900' para PS2).

    Returns:
        Contexto del crash: registros, backtrace, tipo de fallo.
    """
    if arch not in ("r4300i", "r5900", "mips32"):
        raise ValidationError(f"Arquitectura no soportada: {arch}")

    # Por ahora solo soportamos formato PCSX2
    ctx = mem_parser.parse_pcsx2_crash(crash_log)

    return {
        "arch": arch,
        "context": ctx.to_dict(),
        "analysis": _analyze_crash_context(ctx, arch),
    }


def _analyze_crash_context(ctx: mem_parser.CrashContext, arch: str) -> dict:
    """Analiza el contexto de crash y genera hipótesis."""
    issues: list[str] = []
    recommendations: list[str] = []

    if ctx.registers:
        # Verificar PC
        if ctx.registers.pc is not None:
            ptr_check = mem_parser.analyze_pointer(ctx.registers.pc, arch)
            if not ptr_check["is_valid"]:
                issues.append(f"PC inválido: {ptr_check['issues']}")
                recommendations.append("Verificar que PC apunte a código válido")

        # Verificar RA
        ra = ctx.registers.get_gpr("ra")
        if ra is not None:
            ptr_check = mem_parser.analyze_pointer(ra, arch)
            if not ptr_check["is_valid"]:
                issues.append(f"RA inválido: {ptr_check['issues']}")
                recommendations.append("Posible corrupción de stack")

        # Verificar SP
        sp = ctx.registers.get_gpr("sp")
        if sp is not None:
            ptr_check = mem_parser.analyze_pointer(sp, arch)
            if not ptr_check["is_valid"]:
                issues.append(f"SP inválido: {ptr_check['issues']}")
                recommendations.append("Stack pointer corrupto o fuera de rango")

    if ctx.fault_address is not None:
        ptr_check = mem_parser.analyze_pointer(ctx.fault_address, arch)
        if not ptr_check["is_valid"]:
            issues.append(f"Dirección de fallo inválida: {ptr_check['issues']}")

    return {
        "issues": issues,
        "recommendations": recommendations,
        "severity": "high" if issues else "low",
    }


@tool
def crash_resolve_address(address: int, symbols_data: dict | None = None) -> dict:
    """Resuelve una dirección a un símbolo conocido.

    Args:
        address: Dirección a resolver.
        symbols_data: Dict con símbolos {nombre: dirección} (opcional).

    Returns:
        Símbolo más cercano y offset.
    """
    if symbols_data is None:
        return {
            "address": hex(address),
            "symbol": None,
            "offset": None,
            "note": "No symbol table provided",
        }

    # Buscar símbolo más cercano
    closest_name: str | None = None
    closest_addr: int | None = None
    min_distance = float("inf")

    for name, sym_addr in symbols_data.items():
        if isinstance(sym_addr, str):
            sym_addr = int(sym_addr, 16)

        if sym_addr <= address:
            distance = address - sym_addr
            if distance < min_distance:
                min_distance = distance
                closest_name = name
                closest_addr = sym_addr

    if closest_name and closest_addr is not None:
        return {
            "address": hex(address),
            "symbol": closest_name,
            "symbol_address": hex(closest_addr),
            "offset": int(min_distance),
            "formatted": f"{closest_name}+0x{int(min_distance):x}",
        }

    return {
        "address": hex(address),
        "symbol": None,
        "offset": None,
        "note": "No symbol found before this address",
    }
