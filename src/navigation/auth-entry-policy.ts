export type AuthEntryState = {
  isInitializing: boolean;
  isLoggedIn: boolean;
  hasUsername: boolean;
};

export function isProtectedEntryReady(state: AuthEntryState): boolean {
  return !state.isInitializing && state.isLoggedIn && state.hasUsername;
}

export function canEnterProtectedRoute(route: string, state: AuthEntryState): boolean {
  if (isProtectedEntryReady(state)) return true;
  return route.split("?", 1)[0] === "/change-username" &&
    !state.isInitializing && state.isLoggedIn;
}
