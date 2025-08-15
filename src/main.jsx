import { createRoot } from "react-dom/client";
import CookieBanner from "./CookieBanner";
import { trackRemoval } from "./bannerActivity";
import { API_BASE_URL } from "./bannerActivity";
import "./index.css";

// Auto-run banner
function autoInit() {
  const script = document.currentScript || [...document.scripts].pop();
  if (!script) return;

  const url = new URL(script.src);
  const params = new URLSearchParams(url.search);
  const domainId = params.get("domainId");

  if (!domainId) {
    console.warn("CookieBannerSDK: Missing domainId in script src.");
    return;
  }

  localStorage.setItem("domainId", domainId);

  const run = () => {
    const container = document.createElement("div");
    container.id = "cookie-banner-container";
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<CookieBanner />);

    // Set up removal detection for the container
    setupRemovalDetection(container);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
}

// Removal detection function
function setupRemovalDetection(containerElement) {
  // Set up a mutation observer to detect when our container is removed
  const script = document.currentScript || [...document.scripts].pop();
  const url = new URL(script.src);
  const params = new URLSearchParams(url.search);
  const domainId = params.get("domainId");

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        // Check if our container element was removed from body
        if (!document.body.contains(containerElement)) {
          console.log("Cookie Banner SDK: Container removed from body");
          (async () => {
            await trackRemoval();
            observer.disconnect();
          })();
          return;
        }

        // Check if our script tag was removed from head
        const ourScript = [...document.scripts].find(
          (s) =>
            s.src && s.src.includes("jsdelivr") && s.src.includes("domainId")
        );

        if (!ourScript) {
          console.log("Cookie Banner SDK: Script tag removed from head");
          (async () => {
            await trackRemoval();
            observer.disconnect();
          })();
          return;
        }
      }
    });
  });

  // Observe both head and body
  observer.observe(document.head, { childList: true, subtree: true });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also track page unload (in case the entire page is being destroyed)
  window.addEventListener("beforeunload", () => {
    // Use sendBeacon for reliable tracking during page unload
    if (domainId) {
      navigator.sendBeacon(
        `${API_BASE_URL}/banner/integration?domainId=${domainId}`,
        JSON.stringify({ status: false })
      );
    }
  });
}

autoInit();
