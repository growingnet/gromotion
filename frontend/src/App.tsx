import { Landing } from "./pages/Landing";
import { Player } from "./pages/Player";
import { useRoute } from "./routes";

export default function App() {
  // Rendered one at a time rather than hidden, so leaving the player unmounts
  // it: its rAF clock and its space/arrow key handlers must not keep running
  // underneath a prose page, where space means scroll.
  return useRoute() === "player" ? <Player /> : <Landing />;
}
