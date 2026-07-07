/* =====================================================================
   Storage adapter.
   Current backend: localStorage — single-device only. Two people on
   different phones do NOT share data in this version.
   Production backend: Supabase. Replace this module's internals with
   Supabase queries (schema in /supabase/schema.sql) and keep the same
   four-function API so App.jsx does not change.
   ===================================================================== */

const PREFIX = "fulltime::";

export const storage = {
  async get(key) {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? null : { key, value: v };
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .map((k) => k.slice(PREFIX.length));
    return { keys };
  },
};
