# Routine instructions

Paste this into the Instructions box of the Claude Code routine.
Repository: getty-pulse. Connectors: Slack (Close optional).
Schedule: Monday 11:00 UTC — one hour after the GitHub Actions build.

---

Read `out/meta.json`, `out/report.md`, `out/post.txt`, and `out/problems.txt`
from the repo.

1. If `out/meta.json` is missing, or its `runDate` is more than 3 days old,
   DM Colleen (U0B6ZPX55DK) saying the funnel build did not run, and stop.

2. Create a Slack canvas titled exactly the `canvasTitle` value from meta.json.
   Its content is the contents of `out/report.md`, verbatim. Do not edit,
   summarize, reformat, or add commentary. Tables only.

3. Post the contents of `out/post.txt` as a single message to
   #getty-daily-pulse. Verbatim. Do not add anything.

4. If `out/problems.txt` is non-empty, DM Colleen (U0B6ZPX55DK) with its
   contents. Never put error text in the canvas or the channel.

Do not modify the repo. Do not recompute any numbers.
