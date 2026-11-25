// Files people attach in Outreach: a division's redlined Word or PDF file answering a draft review, the office's
// own marked-up draft, or proposed bill language on a wish list item. Kept in D1 in pieces (D1 rows are small).
//   files       one row per file: id, item_id (the Outreach item), division ("" for the office), name, type, size, by, at
//   file_parts  the bytes, base64, in order
export const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const PART = 600 * 1024; // characters of base64 per row
export const OK_TYPES = /\.(pdf|docx?|rtf|odt|txt)$/i;

export async function ensureFiles(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, item_id TEXT, division TEXT, name TEXT, type TEXT, size INTEGER, by TEXT, at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS file_parts (file_id TEXT, n INTEGER, data TEXT, PRIMARY KEY (file_id, n))"),
  ]);
}
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); return btoa(s); };
const unb64 = (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");

// file: a File/Blob from a form. Returns the stored file's details, or throws with a message people can act on.
export async function saveFile(db, file, itemId, division, by) {
  await ensureFiles(db);
  const name = String(file.name || "file").replace(/[\\/\r\n"]/g, "_").slice(0, 140);
  if (!OK_TYPES.test(name)) throw new Error("Attach a Word (.docx or .doc), PDF, RTF or text file.");
  if (file.size > MAX_FILE) throw new Error("That file is over 10 MB. Save it as a smaller PDF or send it by email.");
  const data = b64(new Uint8Array(await file.arrayBuffer()));
  const id = rid(), at = new Date().toISOString();
  const ops = [db.prepare("INSERT INTO files (id, item_id, division, name, type, size, by, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, itemId, division || "", name, String(file.type || "application/octet-stream").slice(0, 120), file.size, String(by || "").slice(0, 80), at)];
  for (let i = 0, n = 0; i < data.length; i += PART, n++) ops.push(db.prepare("INSERT INTO file_parts (file_id, n, data) VALUES (?, ?, ?)").bind(id, n, data.slice(i, i + PART)));
  await db.batch(ops);
  return { id, name, size: file.size, division: division || "", by: String(by || ""), at };
}
export async function fileMeta(db, id) {
  await ensureFiles(db);
  return /^[0-9a-f]{24}$/.test(String(id)) ? db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first() : null;
}
export async function fileBase64(db, id) {
  const parts = (await db.prepare("SELECT data FROM file_parts WHERE file_id = ? ORDER BY n").bind(id).all()).results || [];
  return parts.map((p) => p.data).join("");
}
export async function fileResponse(db, id) {
  const m = await fileMeta(db, id);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(unb64(await fileBase64(db, id)), { headers: { "Content-Type": m.type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${m.name.replace(/[^\x20-\x7e]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function filesFor(db, itemId) {
  await ensureFiles(db);
  return ((await db.prepare("SELECT id, item_id, division, name, size, by, at FROM files WHERE item_id = ? ORDER BY at").bind(itemId).all()).results || []);
}
export async function deleteFile(db, id) {
  await db.batch([db.prepare("DELETE FROM files WHERE id = ?").bind(id), db.prepare("DELETE FROM file_parts WHERE file_id = ?").bind(id)]);
}
// For an email: attach files when they're small enough together, otherwise the email links to them.
export async function attachmentsFor(db, list, cap = 12 * 1024 * 1024) {
  let total = 0; const out = [];
  for (const f of list) { total += f.size || 0; if (total > cap) return null; out.push({ filename: f.name, content: await fileBase64(db, f.id) }); }
  return out;
}
