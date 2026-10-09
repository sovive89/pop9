/**
 * Catálogo central de permissões do PØP9 ERP.
 *
 * IMPORTANTE: este arquivo define as capacidades da interface; não substitui
 * RLS, políticas de banco nem validação nas Edge Functions.
 * Permissões financeiras devem ser verificadas no servidor.
 */
export const PERMISSIONS = [
  "tables.view", "tables.manage", "tables.create", "tables.edit_operational", "tables.join", "tables.split",
  "sessions.open", "sessions.view", "sessions.close",
  "customers.link",
  "orders.create", "orders.view", "orders.cancel_unstarted", "orders.cancel_approval",
  "production.view", "production.manage",
  "pickup.confirm", "delivery.confirm",
  "prints.request", "prints.configure",
  "accounts.view", "accounts.request_close", "accounts.adjust_individual", "accounts.allocate_payable", "accounts.close",
  "payments.view_status", "payments.receive", "payments.refund",
  "menu.manage", "inventory.manage", "users.manage", "reports.view",
] as const;

export type Permission = typeof PERMISSIONS[number];
export type StandardRole = "admin" | "attendant" | "cashier" | "kitchen" | "bar" | "stock";

export const STANDARD_ROLE_PERMISSIONS: Record<StandardRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  attendant: [
    "tables.view", "tables.create", "tables.edit_operational", "tables.join", "tables.split", "sessions.open", "sessions.view", "customers.link",
    "orders.create", "orders.view", "orders.cancel_unstarted",
    "production.view", "pickup.confirm", "delivery.confirm",
    "prints.request", "accounts.view", "accounts.adjust_individual", "accounts.allocate_payable", "accounts.request_close",
    "payments.view_status",
  ],
  cashier: [
    "tables.view", "sessions.view", "sessions.close", "orders.view",
    "prints.request", "accounts.view", "accounts.close",
    "payments.view_status", "payments.receive",
  ],
  kitchen: ["orders.view", "production.view", "production.manage"],
  bar: ["orders.view", "production.view", "production.manage"],
  stock: ["inventory.manage"],
};

/** União de papéis: usuário com mais de uma atribuição recebe suas capacidades combinadas. */
export function permissionsForRoles(roles: readonly string[]): ReadonlySet<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    if (Object.prototype.hasOwnProperty.call(STANDARD_ROLE_PERMISSIONS, role)) {
      for (const permission of STANDARD_ROLE_PERMISSIONS[role as StandardRole]) result.add(permission);
    }
  }
  return result;
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}

/** Mapa de entrada visual; a autorização real da rota deve ser feita separadamente. */
export const ROLE_HOME: Record<StandardRole, string> = {
  admin: "/admin",
  attendant: "/",
  cashier: "/caixa",
  kitchen: "/cozinha",
  bar: "/bar",
  stock: "/admin",
};
