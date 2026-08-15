import { useEffect, useState } from "react";

export type Route = "landing" | "player";

/**
 * Routing lives in the hash because GitHub Pages serves static files with no
 * SPA fallback: a real path like /gromotion/player would 404 before any
 * JavaScript ran. The player's own state stays in the query string, so the two
 * never collide.
 */
function currentRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "player") return "player";
  if (hash === "home") return "landing";
  // An empty hash is ambiguous: it is both the bare site root and what links
  // shared before this page existed look like. Those carry ?run=… and name a
  // growth step, so treat the parameter as the tie-breaker and open the player.
  // This is why "go home" needs the explicit #/home above - the run parameter
  // outlives the navigation and would otherwise pull the visitor straight back.
  if (!hash && new URLSearchParams(window.location.search).has("run")) return "player";
  return "landing";
}

export function useRoute(): Route {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

export const href = (route: Route) => (route === "landing" ? "#/home" : "#/player");
