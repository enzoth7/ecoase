import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import Dashboard from "./Dashboard";
import NativeTableFilters from "./components/NativeTableFilters";
import { NavigationProvider } from "./navigation-client";
import { resolveRoute } from "./route-state";
import "./globals.css";
import "@fontsource-variable/archivo/wght.css";

function App() {
  const [route, setRoute] = useState(() => resolveRoute(window.location.href));
  const navigate = useCallback((href: string, replace = false) => {
    const next = resolveRoute(href);
    if (next.href !== window.location.pathname + window.location.search) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", next.href);
    }
    setRoute(next);
    if (!replace) window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (route.href !== window.location.pathname + window.location.search) window.history.replaceState({}, "", route.href);
    const onPopState = () => setRoute(resolveRoute(window.location.href));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [route.href]);

  return <NavigationProvider value={navigate}><Dashboard {...route} /><NativeTableFilters /><Analytics /></NavigationProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
