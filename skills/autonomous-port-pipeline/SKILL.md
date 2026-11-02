# Autonomous N64 → PS2 port pipeline

Use this skill when the user asks to port an authorized N64 game to PS2 and leave a
reproducible source tree plus a bootable ISO.

## Required workflow

1. Call `port_start` with the local ROM, project root and optional game profile.
2. Inspect every `blocked` stage and install only missing, licensed dependencies.
3. Run the real analysis/recompilation/asset/build tools through their adapters.
4. Preserve generated C/C++, headers, symbols, translated variable maps, runtime
   sources, build files, logs, hashes and the evidence manifest in the project root.
5. Call `port_source_manifest`; do not package an ISO while generated source or the
   variable map is missing.
6. Build the PS2 ELF, call `package_ps2_iso`, then validate boot, inputs, frames,
   audio, memory and performance with PCSX2/PINE when those adapters are available.
7. Mark a job `validated` only from observed evidence. A successful compiler exit is
   never equivalent to a working game.

## Safety and honesty

- Operate only on ROMs, BIOS files and assets supplied by the user and authorized for
  analysis. Never download, embed or redistribute them.
- Write operations require the repository write policy and explicit confirmation.
- If an adapter, BIOS, profile, symbol map or runtime backend is unavailable, return
  `dependency_missing` or a precise blocked stage; never synthesize output.
- Keep original inputs immutable and record SHA-256 hashes for every artifact.
