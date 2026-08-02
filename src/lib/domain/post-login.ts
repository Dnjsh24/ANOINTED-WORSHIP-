export interface PostLoginState {
  hasActiveMembership: boolean;
  hasPendingJoinRequest: boolean;
}

export type PostLoginPath = "/dashboard" | "/pending" | "/teams";

export function resolvePostLoginPath({ hasActiveMembership, hasPendingJoinRequest }: PostLoginState): PostLoginPath {
  if (hasActiveMembership) {
    return "/dashboard";
  }

  if (hasPendingJoinRequest) {
    return "/pending";
  }

  return "/teams";
}

export function resolveSafePostLoginReturnPath(
  candidate: string | null | undefined,
  fallback: PostLoginPath,
): PostLoginPath | "/worship-remote" {
  return candidate === "/worship-remote" ? candidate : fallback;
}
