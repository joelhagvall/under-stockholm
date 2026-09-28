/** Coarse primary pointers cover phones and tablets without treating narrow desktop windows as touch devices. */
export function usesTouchControls(): boolean {
  const params = new URLSearchParams(location.search);
  return window.matchMedia('(pointer: coarse)').matches || (params.has('debug') && params.has('touch'));
}
