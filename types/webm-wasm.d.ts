declare module "webm-wasm/dist/webm-wasm.js" {
  type WebmModuleOptions = {
    noInitialRun?: boolean;
    wasmBinary?: ArrayBuffer;
    onAbort?: (reason: unknown) => void;
    onRuntimeInitialized?: () => void;
  };

  export default function createWebmModule(
    options?: WebmModuleOptions,
  ): unknown;
}
