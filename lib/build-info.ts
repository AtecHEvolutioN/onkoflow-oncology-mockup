export type OnkoFlowMode = "demo" | "department";

export const buildInfo = {
  application: "OnkoFlow",
  version: "0.4.1",
  schemaVersion: 1,
  mode:
    process.env.NEXT_PUBLIC_ONKOFLOW_MODE === "department"
      ? ("department" as const)
      : ("demo" as const),
  commit: process.env.NEXT_PUBLIC_ONKOFLOW_BUILD_COMMIT ?? "development",
  builtAt: process.env.NEXT_PUBLIC_ONKOFLOW_BUILD_DATE ?? "development",
};

export const isDepartmentMode = buildInfo.mode === "department";
