import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { DialogProvider } from "./components/Dialog";
import { ToastProvider } from "./components/Toast";
import { I18nProvider } from "./i18n";
import { router } from "./routes/router";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/utilities.css";
import "./styles/migration.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The vault is single-user and local: refetching on focus only adds noise.
      refetchOnWindowFocus: false,
      staleTime: 5_000,
      retry: false,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("index.html is missing the #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <DialogProvider>
            <RouterProvider router={router} />
          </DialogProvider>
        </ToastProvider>
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
