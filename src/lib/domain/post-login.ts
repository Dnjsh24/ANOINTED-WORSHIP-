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
