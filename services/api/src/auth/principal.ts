/** Who is calling. Attached to the request by {@link AuthGuard}. */

export type RoleName =
  | 'tenant_admin'
  | 'principal'
  | 'hod'
  | 'teacher'
  | 'student'
  | 'guardian'
  | 'librarian'
  | 'accountant'
  | 'transport_manager'
  | 'driver'
  | 'hostel_warden'
  | 'canteen_manager'
  | 'store_keeper'
  | 'admissions_officer'
  | 'hr_manager';

export interface UserPrincipal {
  kind: 'user';
  tenantId: string;
  userId: string;
  roles: RoleName[];
  /** From the token: the user signed in with a temporary password and must change it (AuthGuard). */
  mustChangePassword?: true;
  /** The sign-in (user_sessions row) behind the token; absent on tokens issued before sessions existed. */
  sessionId?: string;
  /** Second factor required by the institution but not set up yet (AuthGuard). */
  mustSetUpMfa?: true;
}

/** An enrolled board, not signed in by a teacher. */
export interface DevicePrincipal {
  kind: 'device';
  tenantId: string;
  deviceId: string;
  campusId: string;
}

/** A board with a teacher paired to it. */
export interface BoardPrincipal {
  kind: 'board';
  tenantId: string;
  deviceId: string;
  campusId: string;
  teacherId: string;
  sessionId: string;
}

export type Principal = UserPrincipal | DevicePrincipal | BoardPrincipal;
export type PrincipalKind = Principal['kind'];
