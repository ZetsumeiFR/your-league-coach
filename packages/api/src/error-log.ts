import { ORPCError, ValidationError } from "@orpc/server";

type IssuePathSegment = PropertyKey | { readonly key: PropertyKey };

const segmentName = (segment: IssuePathSegment): string =>
  String(typeof segment === "object" ? segment.key : segment);

const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error;

/**
 * One log line per failed procedure call. Request bodies, validation inputs and
 * error messages can carry player identity, so only the procedure path, error
 * code, issue paths and error class names are written.
 */
export function describeProcedureError(
  error: unknown,
  path: readonly string[]
): string {
  const procedure = path.join(".");
  if (!(error instanceof ORPCError)) {
    return `rpc ${procedure} failed: ${errorName(error)}`;
  }
  const parts = [`rpc ${procedure} failed: ${error.code} ${error.status}`];
  if (error.cause instanceof ValidationError) {
    const issuePaths = error.cause.issues.map(
      (issue) => (issue.path ?? []).map(segmentName).join(".") || "(root)"
    );
    parts.push(`issues at ${issuePaths.join(", ")}`);
  } else if (error.cause !== undefined) {
    parts.push(`cause ${errorName(error.cause)}`);
  }
  return parts.join("; ");
}

interface ProcedureCall {
  readonly next: () => Promise<unknown>;
  readonly path: readonly string[];
}

/** Procedure-level (`clientInterceptors`) logger; the error is rethrown unchanged. */
export const logProcedureErrors =
  (write: (line: string) => void) =>
  async ({ next, path }: ProcedureCall): Promise<unknown> => {
    try {
      return await next();
    } catch (error) {
      write(describeProcedureError(error, path));
      throw error;
    }
  };
