# AUDITORÍA TÉCNICA — FASE 0
**Proyecto:** N64 / PS2 Reverse Engineering MCP
**Fecha:** 2026-11-01 (America/Montevideo)
**Working directory de la sesión:** `C:\Users\Pixel\Desktop\mcp-engenier-ps2-ports` (vacío)

---

## 1. Estado del entorno de ejecución (hallazgos críticos)

| Componente | Estado | Detalle |
|---|---|---|
| Shell `pwsh` | **ROTO** | Todos los comandos (incluso `Write-Output "hello"`) fallan con `0xC0000142` (STATUS_DLL_INIT_FAILED). También falla `git`. Es un fallo del entorno/harness, no del código. |
| `glob` / `read` / `write` | Funcionan | La capa de sistema de archivos del harness sí responde. |
| `web_fetch` / `web_search` | Funcionan | Red disponible. |
| Disco `D:\` | **No responde** | `glob` sobre `D:\*` agotó el timeout de 30 s (posible unidad óptica/desconectada). |
| Repo real del port | **DESAPARECIDO** | El workspace real `C:\Users\Pixel\Desktop\antho smk64` ya no existe en disco. |

**Consecuencia del shell roto:** no es posible ejecutar `git`, `node`, `python`, `make`, `gcc`, ni descargar herramientas, clonar repos, compilar, ejecutar pruebas o hacer push. Toda operación de ejecución de procesos externos está bloqueada en este momento.

---

## 2. Repositorio real del port — evidencia reconstruida

### 2.1 Ubicación original
Confirmada en la sesión `.kiro` `sess_941bbe59-d503-4ca6-82ae-5b4e6f7d46b0` (`session.json`):

```json
"title": "Continuar Port MK64 a PS2",
"workspacePaths": ["c:\\Users\\Pixel\\Desktop\\antho smk64"],
"rootPaths":     ["c:\\Users\\Pixel\\Desktop\\antho smk64"],
"modelId": "claude-sonnet-4.5",
"autopilot": true,
"createdAt": "2026-09-22T21:56:55.044Z"
```

Esa carpeta **ya no existe** (`rg: ... El sistema no puede encontrar el archivo especificado`). Solo quedan los **snapshots** de `.kiro`, que contienen copias de los archivos modificados por el agente anterior.

### 2.2 Qué es el proyecto
Port nativo de **Super Mario Kart 64 (USA)** a **PlayStation 2**, basado en la descompilación (estilo n64decomp/sm64). Datos reales extraídos de los snapshots:

- **ROM de origen:** `baserom.us.z64`, SHA-1 `579c48e211ae952530ffc8738709f078d5dd215e`.
- **Toolchain:** PS2SDK (ps2dev) — `mips64r5900el-ps2-elf-gcc` (MIPS R5900, *little-endian*, `-D_EE`), `mips64r5900el-ps2-elf-{ld,objcopy,strip,as}`.
- **Bibliotecas:** gsKit (gráficos), dmakit (DMA), audsrv (audio), libpad (mando), libmc (memory card), libkernel, libc.
- **Variables de entorno:** `PS2DEV`/`PS2SDK`. En el snapshot `ps2_irx.s` la ruta incrustada era `C:/ps2dev/ps2sdk/iop/irx/audsrv.irx` (el toolchain estuvo en `C:\ps2dev`, **no** en `D:`).

### 2.3 Estructura (por el Makefile y los snapshots)
```
antho smk64/
├── Makefile                  # build GNU Make multi-objetivo
├── baserom.us.z64            # (NO presente en snapshots: lo aporta el usuario)
├── extract_assets.py
├── src/                      # código descompilado del juego (C, .inc.c)
├── courses/                  # una carpeta por pista (course_data.c, offsets, textures, DL, vertices)
├── assets/code/              # common_data, ceremony_data, startup_logo
├── data/                     # texturas, karts, audio (C y .s)
├── tools/                    # mio0, displaylist_packer, libtkmk00, make_iso, gen_ps2_linkfile...
├── link/                     # (mk64.ld upstream + segment.ld)
└── smk64ps2/
    ├── src/                  # capa de compatibilidad PS2 (ps2_ultra_*, ps2_video, ps2_gfx, ps2_input, ps2_irx.s)
    ├── include/ps2_ultra.h   # API libultra reimplementada sobre ps2sdk
    └── link/                 # segment.ld, smk64ps2.ld, mk64.ld
```

### 2.4 Diseño técnico del port (verificado en snapshots)
1. **Capa de compatibilidad libultra** (`ps2_ultra.h`): reimplementa la API de libultra de N64 (hilos, colas de mensajes, PI DMA, Video Interface, Audio Interface, EEPROM, caché, reloj) sobre ps2sdk, **sin modificar el código del juego**.
   - `ps2_ultra_thread.c`: cada `OSThread` → hilo del kernel EE; prioridad traducida `126 - (pri*116)/255`; pilas de 128 KB; colas de espera en formato libultra con semáforos EE.
   - `ps2_audio_ai.c` → audsrv; `ps2_eeprom.c` → memory card; `ps2_ultra_pi.c` → copia en RAM.
2. **Intérprete F3DEX** (`ps2_gfx.c`): ejecuta las display lists RDP de N64 sobre el GS (Graphics Synthesizer).
3. **Segmentos N64** (`segment.ld`): los datos segmentados (0x02, 0x05, 0x06, 0x07, 0x09, 0x0A, 0x0B, 0x0D, 0x0F) se enlazan aparte con `--section-start .data=0x0N000000`, se vuelcan a binario y se incrustan en el ELF principal, que toma los símbolos con `-R` (el código ve `0x06001234`, no direcciones de RAM).
4. **Endianness:** los Gfx se empaquetan en big-endian N64 y se invierten con `--reverse-bytes=4` al volcar (el EE es little-endian).
5. **Compresión MIO0** y **empaquetado de display lists** con herramientas host (`tools/mio0`, `tools/displaylist_packer`).
6. **Diagnóstico de arranque:** barras de color por etapa (azul=GS, verde=F3DEX, amarillo=mando, blanco=entrando a `main_func()`); build `diag` con `-DSMK64_NO_GAME`.

### 2.5 Estado del port
El comentario de `ps2_main.c` lo describe como **"a medias"** (medio hecho): el arranque llegó a colgarse en el arranque de hilos (`osStartThread(&gIdleThread)`), y el snapshot `ps2_ultra_thread.c` documenta una reescritura del modelo de hilos (de "ceder sin conmutar" a hilos EE con prioridad estricta). Es el punto de partida técnico real para las herramientas de análisis del MCP.

---

## 3. Repositorio GitHub (nueva fuente de coordinación)

- Repo indicado: `https://github.com/anthoo582/retrace-mcp.git` → **verificado, existe** (HTTP 200).
- **⚠️ Seguridad del token:** el PAT `ghp_…` fue compartido en texto plano. Recomendación: **revocarlo/rotarlo de inmediato** en GitHub Settings → Developer settings → Tokens, porque ya quedó expuesto en el historial de este chat. No será escrito en ningún archivo ni commit de este proyecto.

---

## 4. Qué hace falta para poder avanzar (bloqueos a resolver)

1. **Reparar el shell** (`pwsh` con `0xC0000142`). Sin esto no hay descargas, clon, build, test ni push.
2. **Confirmar el disco `D:\`** (no respondió) o indicar una ruta alternativa para las herramientas de RE.
3. **Decidir el destino del port**: restaurar `antho smk64` (¿está en otro disco/Git?) o reconstruirlo desde los snapshots de `.kiro`.
4. **Aclarar la coordinación multi-agente**: el repo `retrace-mcp` será la fuente del MCP; el port `smk64ps2` es un repo separado. Confirmar si ambos conviven en GitHub y con qué estructura de ramas (`master`).

---

## 5. Plan técnico propuesto (basado en los hallazgos)

| Fase | Objetivo | Estado |
|---|---|---|
| 0 | Auditoría del repositorio | **Hecho (este documento), salvo remote/branch del port (repo ausente + shell roto)** |
| 1 | Fundación MCP (SDK oficial, STDIO, registro de tools, logging, tests) | Pendiente — requiere shell |
| 2 | Repository Intelligence (índice del proyecto smk64ps2) | Pendiente |
| 3 | ROM / ELF / MIPS (parsers, desensamblado R4300i/R5900, símbolos, diff) | Pendiente |
| 4 | Memory forensics (dumps, registros, resolución de direcciones) | Pendiente |
| 5 | Gráficos (RDP/RSP, GS, texturas) y audio (N64/PS2) | Pendiente |
| 6 | Knowledge graph / motor de correlación | Pendiente |
| 7 | Multicliente (OpenCode, Claude Code, Codex) | Pendiente |
| 8 | Validación final | Pendiente |

**Herramientas externas candidatas** (a instalar en `D:` cuando el shell y `D:` funcionen): PS2SDK, binutils MIPS (`mips64r5900el-ps2-elf-*`), Capstone, radare2, Python3, Node.js; opcionales según disponibilidad: Ghidra, objdump/readelf/nm del toolchain.

---

## 6. Conclusión

El port **es real y está técnicamente bien documentado** en los snapshots, pero el **repositorio en disco desapareció** y el **shell del harness está roto**, lo que impide descargar, clonar, compilar, probar y subir. La primera acción es **restaurar el entorno de ejecución**; después se puede reconstruir el repo del port y fundar el MCP sobre datos reales.
