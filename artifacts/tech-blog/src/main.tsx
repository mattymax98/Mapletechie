import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AppErrorBoundary, reloadOnceForStaleChunk } from "@/components/AppErrorBoundary";

// After a publish, fingerprinted route chunks from the previous deployment no
// longer exist. Vite fires this event when a lazy import fails — reload once
// so open tabs pick up the new version instead of showing a blank screen.
window.addEventListener("vite:preloadError", (event) => {
  // Always suppress Vite's rethrow — even when the reload cooldown blocks a
  // second reload, rethrowing would just crash the app. The error boundary
  // and route fallback handle the degraded state instead.
  event.preventDefault();
  reloadOnceForStaleChunk();
});

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
