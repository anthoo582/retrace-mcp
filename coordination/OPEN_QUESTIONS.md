# Open questions for the human owner

1. The port repository (`antho smk64` / `smk64ps2`) is not present on this machine.
   Retrace needs its path (or clone URL) to run repository intelligence against real data.
2. Write access policy: should `RETRACE_ALLOW_WRITE=1` be enabled by default in the owner's
   local client configs, or stay opt-in per session?
3. The GitHub PAT shared in chat is exposed. Rotate it and provide a fresh one through the
   environment (`GITHUB_TOKEN`) instead of pasting it into a repository file.
