import { validateDevelopmentStorageAccess } from "../lib/objectStorage";

try {
  await validateDevelopmentStorageAccess();
  console.log(
    "Development storage is writable and production storage access is denied.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Development storage validation failed.",
  );
  process.exitCode = 1;
}