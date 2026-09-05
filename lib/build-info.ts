export type OnkoFlowMode = "production" | "department";

export const buildInfo = {
  application: "OnkoFlow",
  version: "0.9.0",
  schemaVersion: 2,
  mode:
    process.env.NEXT_PUBLIC_ONKOFLOW_MODE === "department"
      ? ("department" as const)
      : ("production" as const),
  commit: process.env.NEXT_PUBLIC_ONKOFLOW_BUILD_COMMIT ?? "development",
  builtAt: process.env.NEXT_PUBLIC_ONKOFLOW_BUILD_DATE ?? "development",
};

export const isDepartmentMode = buildInfo.mode === "department";
