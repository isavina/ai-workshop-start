# Web view
`./skill-atlas serve [port]`: a local page at `http://localhost:<port>`, 4173 by default
- Prints its address; runs until stopped. Only on *this machine* (`127.0.0.1`)
- A port in use, or not a port → a clear message, exit code 1
## Page
- A **field** for a repository: what `scan` takes, a GitHub URL, `…/tree/<ref>` or a directory
- Its **skills**: the same scan, the same order; name, *full* description, path
- The selected skill's **SKILL.md**: as it is, front matter included; its link, `also in`
- Warnings and errors: the same messages as the CLI, on the page
- The address keeps `?repository=…&skill=<path>`: a scan can be linked and reloaded
- Each scan is done when asked; *nothing is stored*
## API
`GET /api/scan?repository=<input>` → `{ repository, skills, warnings }`, each skill with its `link` and `text`;
a message the CLI would exit 1 for → status 400, `{ error }`
