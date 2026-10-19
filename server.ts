const DATA = process.env.DATA_DIR ?? "./data";
const ROOT = import.meta.dir;
const PAGES = new Set(["/principal.html", "/paciente.html"]);
const IMG_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TEXT_FIELDS = ["nombre", "dni", "fecha", "resumen", "docNombre", "docCOP", "desc1", "desc2", "desc3"];
const MAX_FILE = 200 * 1024 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function crear(req: Request) {
  const form = await req.formData();
  const nombre = String(form.get("nombre") ?? "").trim();
  if (!nombre) return json({ error: "nombre requerido" }, 400);
  const id = crypto.randomUUID();
  const dir = `${DATA}/${id}`;
  const record: Record<string, unknown> = { createdAt: new Date().toISOString() };
  for (const k of TEXT_FIELDS) record[k] = String(form.get(k) ?? "").slice(0, 5000);
  const files: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" || value.size === 0) continue;
    if (value.size > MAX_FILE) return json({ error: "archivo muy grande" }, 413);
    let name: string | undefined;
    if (key === "model" && value.name.toLowerCase().endsWith(".ply")) name = "model.ply";
    if (/^img[123]$/.test(key) && IMG_EXT[value.type]) name = `${key}.${IMG_EXT[value.type]}`;
    if (!name) continue;
    await Bun.write(`${dir}/${name}`, value);
    files[key] = name;
  }
  record.files = files;
  await Bun.write(`${dir}/record.json`, JSON.stringify(record));
  return json({ id }, 201);
}

async function leer(id: string, sub?: string) {
  const dir = `${DATA}/${id}`;
  const rf = Bun.file(`${dir}/record.json`);
  if (!(await rf.exists())) return json({ error: "no encontrado" }, 404);
  const rec = await rf.json();
  const files: Record<string, string> = rec.files ?? {};
  if (!sub) {
    const { files: _files, ...pub } = rec;
    return json({ ...pub, hasModel: !!files.model, images: [1, 2, 3].map((n) => !!files[`img${n}`]) });
  }
  const key = sub === "model" ? "model" : `img${sub.slice(4)}`;
  if (!files[key]) return json({ error: "no encontrado" }, 404);
  return new Response(Bun.file(`${dir}/${files[key]}`), { headers: { "Cache-Control": "private, max-age=3600" } });
}

Bun.serve({
  port: Number(process.env.PORT ?? 8080),
  hostname: "0.0.0.0",
  maxRequestBodySize: 300 * 1024 * 1024,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (req.method === "POST" && pathname === "/api/pacientes") return crear(req);
    const m = pathname.match(/^\/api\/pacientes\/([0-9a-f-]{36})(?:\/(model|img\/[123]))?$/i);
    if (m && req.method === "GET") return leer(m[1], m[2]);
    if (pathname === "/") return Response.redirect(new URL("/principal.html", req.url), 302);
    if (PAGES.has(pathname) && req.method === "GET") return new Response(Bun.file(`${ROOT}${pathname}`));
    return new Response("No encontrado", { status: 404 });
  },
});
