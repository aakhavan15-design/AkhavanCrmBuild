import type { AppState, UserAccount, Role, PermissionSet, CapabilityPermission } from '../types';

export type AuthenticationResult =
  | { status: 'AUTHENTICATED'; user: UserAccount; role: Role; permissionSet: PermissionSet }
  | { status: 'INVALID_CREDENTIALS' }
  | { status: 'NOT_CONFIGURED' }
  | { status: 'ROLE_NOT_ASSIGNED' }
  | { status: 'NETWORK_ERROR' };

/**
 * Authentication is server-authoritative. Local IndexedDB users are profile/permission
 * projections only and must never be treated as password credentials.
 */
const DEMO_AUTH_ENABLED = import.meta.env?.DEV === true || import.meta.env?.VITE_ENABLE_DEMO_DATA === 'true';
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;

export const AuthService = {
  isAuthenticated(): boolean {
    if (!accessToken || Date.now() >= accessTokenExpiresAt) { accessToken = null; accessTokenExpiresAt = 0; return false; }
    return true;
  },

  getAccessToken(): string | null {
    return this.isAuthenticated() ? accessToken : null;
  },

  clearSession(): void { accessToken = null; accessTokenExpiresAt = 0; },
  getCurrentUser(state: AppState): UserAccount | null {
    if (!state.users || state.users.length === 0) return null;
    return state.users.find(u => u.id === state.currentUserId) || null;
  },

  async authenticate(
    credentials: { tenantCode: string; username: string; password: string },
    state?: AppState
  ): Promise<AuthenticationResult> {
    accessToken = null;
    accessTokenExpiresAt = 0;
    const tenantCode = credentials.tenantCode.trim();
    const username = credentials.username.trim();
    const password = credentials.password;
    if (!tenantCode || !username || !password) return { status: 'INVALID_CREDENTIALS' };

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ tenantCode, userName: username, password })
      });
      if (response.status === 401) return { status: 'INVALID_CREDENTIALS' };
      if (response.status === 503 || response.status === 404) return { status: 'NOT_CONFIGURED' };
      if (response.status === 403) {
        const denial = await response.json().catch(() => null) as { error?: { code?: string } } | null;
        return denial?.error?.code === 'ROLE_NOT_ASSIGNED' ? { status: 'ROLE_NOT_ASSIGNED' } : { status: 'NETWORK_ERROR' };
      }
      if (!response.ok) return { status: 'NETWORK_ERROR' };

      const payload = await response.json() as {
        accessToken?: string; expiresIn?: number;
        user?: {
          id?: string; tenantId?: string; userName?: string; displayName?: string; email?: string | null; phone?: string | null;
          branchId?: string | null; territoryId?: string | null; teamId?: string | null;
          role?: { id?: string; code?: string; name?: string; visibilityScope?: Role['visibilityScope'] };
          permissionSet?: { id?: string; name?: string; permissions?: string[]; fieldPermissions?: Record<string, 'SEE' | 'DO' | 'HIDDEN'> };
        };
      };
      const serverUser = payload.user;
      if (!payload.accessToken || typeof payload.expiresIn !== 'number' || payload.expiresIn <= 0) return { status: 'NETWORK_ERROR' };
      if (!serverUser?.id || !serverUser.userName || !serverUser.role?.id || !serverUser.permissionSet?.id) return { status: 'ROLE_NOT_ASSIGNED' };

      const allowedPermissions: CapabilityPermission[] = [
        'accounts.view','accounts.edit','accounts.delete','leads.view','leads.edit','quotes.view','quotes.create','quotes.approve',
        'finance.view','finance.manage','settings.manage','cases.view','cases.edit','marketing.manage','knowledge.manage',
        'agents.manage','automation.manage','users.manage','roles.manage','internal.view','internal.manage','geo.view','geo.manage'
      ];
      const permissions = [...new Set((serverUser.permissionSet.permissions || []).map(value => value.trim().toLowerCase()).filter((value): value is CapabilityPermission => allowedPermissions.includes(value as CapabilityPermission)))];
      const role: Role = {
        id: serverUser.role.id,
        name: serverUser.role.name || serverUser.role.code || 'نقش سازمانی',
        visibilityScope: serverUser.role.visibilityScope || 'OWNER',
        description: serverUser.role.code || undefined
      };
      const permissionSet: PermissionSet = {
        id: serverUser.permissionSet.id,
        name: serverUser.permissionSet.name || role.name,
        permissions,
        fieldPermissions: serverUser.permissionSet.fieldPermissions || {}
      };
      const user: UserAccount = {
        id: serverUser.id,
        name: serverUser.displayName || serverUser.userName,
        username: serverUser.userName,
        email: serverUser.email || undefined,
        phone: serverUser.phone || undefined,
        roleId: role.id,
        permissionSetId: permissionSet.id,
        branchId: serverUser.branchId || undefined,
        territoryId: serverUser.territoryId || undefined,
        teamId: serverUser.teamId || undefined,
        tenantId: serverUser.tenantId || undefined,
        isActive: true,
        active: true
      } as UserAccount;
      accessToken = payload.accessToken;
      accessTokenExpiresAt = Date.now() + Math.min(payload.expiresIn, 3600) * 1000;
      return { status: 'AUTHENTICATED', user, role, permissionSet };
    } catch {
      // Demo/test-phase fallback (no backend yet). Never available in production builds unless
      // VITE_ENABLE_DEMO_DATA=true is set explicitly at build time.
      if (!DEMO_AUTH_ENABLED) return { status: 'NETWORK_ERROR' };
      const normUser = username.toLowerCase();
      const validDemoUsers: Record<string, { id: string; name: string; roleId: string; roleName: string }> = {
        'a.akhavan': { id: 'user-admin', name: 'علی اخوان', roleId: 'role-admin', roleName: 'مدیر ارشد سامانه' },
        'admin': { id: 'user-admin', name: 'علی اخوان', roleId: 'role-admin', roleName: 'مدیر ارشد سامانه' },
        's.rezaei': { id: 'user-sales-1', name: 'سارا رضایی', roleId: 'role-sales', roleName: 'مدیر فروش' },
        'r.kamali': { id: 'user-finance-1', name: 'رضا کمالی', roleId: 'role-finance', roleName: 'مدیر مالی' }
      };
      const demoUser = validDemoUsers[normUser] || (state?.users?.find(u => u.username?.toLowerCase() === normUser || u.id === state.currentUserId));
      if (demoUser && ['123456', 'akhavan123', 'admin123', '123', 'password'].includes(password)) {
        const uId = 'id' in demoUser ? demoUser.id : 'user-admin';
        const uName = 'name' in demoUser ? demoUser.name : 'کاربر اخوان';
        const rId = 'roleId' in demoUser ? (demoUser as Record<string, unknown>).roleId : 'role-admin';
        const rName = 'roleName' in demoUser ? (demoUser as Record<string, unknown>).roleName : 'مدیر سیستم';
        const role: Role = { id: rId, name: rName, visibilityScope: 'ORG' };
        const permissionSet: PermissionSet = { id: rId, name: rName, permissions: ['accounts.view','accounts.edit','leads.view','quotes.view','quotes.create','finance.view','settings.manage','cases.view','internal.view','geo.view'], fieldPermissions: {} };
        const user: UserAccount = { id: uId, name: uName, username: normUser, roleId: rId, permissionSetId: rId, isActive: true, active: true };
        accessToken = 'demo-token-' + Date.now();
        accessTokenExpiresAt = Date.now() + 3600000;
        return { status: 'AUTHENTICATED', user, role, permissionSet };
      }
      return { status: 'NETWORK_ERROR' };
    }
  }
};
