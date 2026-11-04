// Server-side only helpers (used by route handlers). The browser never talks to Odoo directly.
export const ODOO_URL = (process.env.ODOO_URL || "http://localhost:8069").replace(/\/$/, "");
export const ODOO_DB = process.env.ODOO_DB || "";
export const COOKIE = "wm_session";
export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
  path: "/",
  maxAge: 60 * 60 * 24,
};
