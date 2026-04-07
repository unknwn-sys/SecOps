import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import OffensiveSecurityLayout from "./components/OffensiveSecurityLayout";
import Home from "./pages/Home";
import WiFiModule from "./pages/WiFiModule";
import HIDModule from "./pages/HIDModule";
import RFIDModule from "./pages/RFIDModule";
import LANModule from "./pages/LANModule";
import Logging from "./pages/Logging";
import Settings from "./pages/Settings";
import { PayloadManager } from "./pages/PayloadManager";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path={"/login"} component={Login} />

      {/* Protected routes wrapped in layout */}
      <Route
        path="*"
        component={() => (
          <OffensiveSecurityLayout>
            <Switch>
              <Route path={"/"} component={Home} />
              <Route path={"/wifi"} component={WiFiModule} />
              <Route path={"/hid"} component={HIDModule} />
              <Route path={"/rfid"} component={RFIDModule} />
              <Route path={"/lan"} component={LANModule} />
              <Route path={"/logs"} component={Logging} />
              <Route path={"/settings"} component={Settings} />
              <Route path={"/payloads"} component={PayloadManager} />
              <Route path={"/404"} component={NotFound} />
              {/* Final fallback route */}
              <Route component={NotFound} />
            </Switch>
          </OffensiveSecurityLayout>
        )}
      />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
