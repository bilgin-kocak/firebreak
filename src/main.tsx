import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("WebMCP Firebreak root element is missing.");
createRoot(root).render(<App />);
