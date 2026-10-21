import { defineConfig } from "shaders/config";

export default defineConfig({
  // Components are imported from 'shaders/react'
  framework: "react",
  // Where `npx shaders install` writes component files
  outDir: "components/shaders",
  // Shaders project this codebase is connected to
  project: "dae46a56-2ddd-485a-b3a1-1b3e321d142c",
});
