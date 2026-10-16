/** `api.whiteboard.update` becomes the string "whiteboard:update": enough for the fake backend to dispatch on. */
export const api = new Proxy({} as Record<string, Record<string, string>>, {
  get: (_t, module) => new Proxy({}, { get: (_m, fn) => `${String(module)}:${String(fn)}` }),
});
