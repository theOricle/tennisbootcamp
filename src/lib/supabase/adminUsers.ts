// Paged reads of the Supabase auth user list (backlog #37).
//
// GoTrue's admin listUsers returns one page at a time. Before this file every
// caller asked for page 1 of 200 and stopped, so user #201 onward was
// invisible: the quiz and enroll flows found "no account", tried to create
// one, hit "already exists", and gave up with no id. Everything that needs
// the whole list, or one user in it, now goes through here.
//
// No "server-only" import on purpose: the two functions are pure over the
// client they're handed, so `npm test` can drive them with a fake. The real
// callers (src/lib/players.ts, the reset-password route) are server-only
// themselves and pass the service-role client.

export const ADMIN_USERS_PER_PAGE = 1000; // GoTrue's maximum page size.
export const ADMIN_USERS_MAX_PAGES = 50; // 50 000 users — far past this project.

/** The slice of a GoTrue user the lookups need. */
export type AdminUser = {
  id: string;
  email?: string | null;
  recovery_sent_at?: string | null;
};

type ListUsersResult<U extends AdminUser> =
  | { data: { users: U[]; total?: number }; error: null }
  | { data: { users: never[]; total?: number } | null; error: { status?: number } | null };

/** The one admin call these helpers use, as supabase-js exposes it. */
export type AdminUsersClient<U extends AdminUser = AdminUser> = {
  auth: {
    admin: {
      listUsers(params?: { page?: number; perPage?: number }): Promise<ListUsersResult<U>>;
    };
  };
};

export type ListAllUsersResult<U extends AdminUser> = {
  users: U[];
  /** False when a page failed or the page cap was hit: `users` is partial. */
  complete: boolean;
};

/** Trim + lowercase, the email rule every lookup shares. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Walks the user list page by page, calling `onPage` for each. Stops when
 * `onPage` returns true, on a short page (the last one), on an error
 * response, or at ADMIN_USERS_MAX_PAGES. Logs are PII-free: counts and
 * statuses only.
 *
 * A *thrown* listUsers (network, bad config) propagates, exactly as the
 * one-page call did on main: provisionIntakeAccount's outer catch turns it
 * into account:"skipped" (no second set-password email), and every other
 * caller either catches it or did not catch it before either. Only an error
 * *response* is swallowed to "incomplete", as before.
 *
 * The short page is the stop signal rather than auth-js's `nextPage` (its
 * parsing of the Link header is unreliable from page 10 on). Backstop: when
 * the response carries a numeric `total` and the walk ends short of it,
 * warn — counts only, never an address.
 */
async function walkUsers<U extends AdminUser>(
  client: AdminUsersClient<U>,
  onPage: (users: U[]) => boolean
): Promise<{ complete: boolean; stopped: boolean }> {
  let seen = 0;
  for (let page = 1; page <= ADMIN_USERS_MAX_PAGES; page++) {
    const result = await client.auth.admin.listUsers({ page, perPage: ADMIN_USERS_PER_PAGE });
    if (result.error || !result.data) {
      console.error(
        "[adminUsers] listUsers failed on page",
        page,
        "(status",
        result.error?.status ?? "n/a",
        ")"
      );
      return { complete: false, stopped: false };
    }
    const users = result.data.users as U[];
    seen += users.length;
    if (onPage(users)) return { complete: true, stopped: true };
    if (users.length < ADMIN_USERS_PER_PAGE) {
      const total = result.data.total;
      if (typeof total === "number" && Number.isFinite(total) && seen < total) {
        console.warn(
          "[adminUsers] short page",
          page,
          "ended the walk at",
          seen,
          "users but the server reports",
          total
        );
        return { complete: false, stopped: false };
      }
      return { complete: true, stopped: false };
    }
  }
  console.warn(
    "[adminUsers] page cap reached after",
    ADMIN_USERS_MAX_PAGES,
    "pages — user list is incomplete"
  );
  return { complete: false, stopped: false };
}

/**
 * The auth user whose email matches (trimmed, case-insensitive), or null
 * when there is none, the email is blank, or a page returned an error.
 * Pages until found or the list runs out, so the 200-user ceiling is gone.
 * Throws only when listUsers itself throws (see walkUsers).
 */
export async function findAuthUserByEmail<U extends AdminUser>(
  client: AdminUsersClient<U>,
  email: string
): Promise<U | null> {
  const target = normalizeEmail(email);
  if (!target) return null;
  let found: U | null = null;
  await walkUsers(client, (users) => {
    found = users.find((u) => normalizeEmail(u.email ?? "") === target) ?? null;
    return found !== null;
  });
  return found;
}

/**
 * Every auth user, across all pages. `complete` is false on a cut-off list
 * (error response, page cap, or a short page below the server's total).
 * Throws only when listUsers itself throws (see walkUsers).
 */
export async function listAllAuthUsers<U extends AdminUser>(
  client: AdminUsersClient<U>
): Promise<ListAllUsersResult<U>> {
  const users: U[] = [];
  const { complete } = await walkUsers(client, (page) => {
    users.push(...page);
    return false;
  });
  return { users, complete };
}
