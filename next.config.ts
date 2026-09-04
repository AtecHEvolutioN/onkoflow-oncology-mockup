import type { NextConfig } from "next";

const isDepartmentBuild = process.env.ONKOFLOW_DEPARTMENT_BUILD === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isDepartmentBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
        assetPrefix: ".",
      }
    : {}),
  env: {
    NEXT_PUBLIC_ONKOFLOW_MODE: isDepartmentBuild ? "department" : "production",
    NEXT_PUBLIC_ONKOFLOW_BUILD_COMMIT:
      process.env.ONKOFLOW_BUILD_COMMIT ?? "development",
    NEXT_PUBLIC_ONKOFLOW_BUILD_DATE:
      process.env.ONKOFLOW_BUILD_DATE ?? "development",
  },
};

export default nextConfig;
