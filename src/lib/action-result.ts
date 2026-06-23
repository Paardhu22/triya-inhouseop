export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const actionOk = <T = undefined>(data?: T): ActionResult<T> => ({
  ok: true,
  data: data as T,
});

export const actionError = (error: string): ActionResult<never> => ({
  ok: false,
  error,
});
