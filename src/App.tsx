import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { routerBasename, staticPublic } from "@/lib/hosting";
import AppRoutes from "./AppRoutes";
import AuthGate from "@/components/AuthGate";

const queryClient = new QueryClient();

const RoutedApp = () => (
  <BrowserRouter basename={routerBasename()}>
    <AppRoutes />
  </BrowserRouter>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {staticPublic ? (
        <RoutedApp />
      ) : (
        <AuthGate>
          <RoutedApp />
        </AuthGate>
      )}
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
