export class ApiError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireUser(req) {
  if (!req.user) throw new ApiError(401, "not_onboarded");
  return req.user;
}

export function requireActivated(req) {
  const u = requireUser(req);
  if (u.activated_until <= Date.now()) throw new ApiError(403, "not_activated");
  return u;
}

export function requireCheckedIn(req) {
  const u = requireUser(req);
  if (u.checked_in_until <= Date.now()) throw new ApiError(403, "not_checked_in");
  return u;
}

export function requireAdmin(req) {
  const u = requireUser(req);
  if (u.role !== "admin") throw new ApiError(403, "forbidden");
  return u;
}

export function requireSuperAdmin(req) {
  const u = requireAdmin(req);
  if (!u.is_super) throw new ApiError(403, "forbidden");
  return u;
}
