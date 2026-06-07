import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { TimerOverlayApp } from "./app/TimerOverlayApp";
import "./styles/tailwind.css";

const queryClient = new QueryClient();
const isTimerOverlay = window.location.hash === "#timer-overlay";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isTimerOverlay ? <TimerOverlayApp /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>
);
