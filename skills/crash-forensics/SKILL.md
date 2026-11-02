# crash-forensics
purpose: Structured forensic methodology for diagnosing memory faults, crashes, TLB exceptions, and bus errors in N64 and PS2 environments.

## Ámbito de aplicación
Análisis de reportes de errores de emuladores (PCSX2, Ares, Project64), dumps de registros y volcados de memoria.

## Fuentes de información
1. **Registros de CPU**:
   - `PC / EPC`: Contador de programa en el momento del fallo.
   - `BadVAddr`: Dirección virtual que intentó acceder la instrucción culpable.
   - `Cause`: Código de excepción de MIPS (ej. 4 = Address Error Load, 5 = Address Error Store, 6 = Bus Error IFetch, 7 = Bus Error DFetch, 8 = Syscall, 9 = Breakpoint, 10 = Reserved Instruction, 12 = Overflow).
   - `SP`: Puntero de pila; verificar si apunta dentro del rango de RAM del stack.
   - `RA`: Dirección de retorno más reciente.
2. **Punteros sospechosos**:
   - `0x00000000 - 0x00000FFF`: Punteros nulos o desreferenciación con offset pequeño (ej. `v0->field` cuando `v0 == NULL`).
   - `Bit 0 o Bit 1 activo` en accesos a palabras de 32 bits: Punteros desalineados (Address Error).
   - Direcciones fuera de la memoria física de la consola (ej. `> 0x01FFFFFF` en PS2 o `> 0x807FFFFF` en N64).

## Metodología de investigación
1. Extraer los registros mediante `crash_analyze`.
2. Resolver el símbolo del `PC` utilizando `elf_find_function` o el mapa de símbolos.
3. Desensamblar la instrucción en `PC` con `mips_disassemble` para identificar la operación causante (ej. `lw $v0, 4($a0)`).
4. Comprobar el valor del registro base (en este ejemplo `$a0`); si coincide con `BadVAddr - offset`, el puntero base era inválido.
5. Inspeccionar el grafo de llamadas hacia atrás mediante `$ra` y las palabras de la pila para identificar qué función invocó la operación defectuosa.
6. Formular hipótesis basadas en evidencias verificables y no en especulaciones.

