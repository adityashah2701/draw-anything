import { z } from "zod";

export const validateJsonWithSchema = <T>(
  schema: z.ZodType<T>,
  value: unknown,
):
  | { ok: true; value: T }
  | { ok: false; errors: string[] } => {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  };
};
