import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { 
  Wifi, 
  Zap, 
  Radio, 
  Network, 
  FileText, 
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  Package
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  description: string;
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: <Shield className="w-5 h-5" />,
    description: "System overview and status",
  },
  {
    label: "WiFi Attacks",
    href: "/wifi",
    icon: <Wifi className="w-5 h-5" />,
    description: "Network scanning and attacks",
  },
  {
    label: "HID Injection",
    href: "/hid",
    icon: <Zap className="w-5 h-5" />,
    description: "Keystroke injection payloads",
  },
  {
    label: "RFID Operations",
    href: "/rfid",
    icon: <Radio className="w-5 h-5" />,
    description: "Tag cloning and emulation",
  },
  {
    label: "LAN Implantation",
    href: "/lan",
    icon: <Network className="w-5 h-5" />,
    description: "Network device operations",
  },
  {
    label: "Payload Manager",
    href: "/payloads",
    icon: <Package className="w-5 h-5" />,
    description: "Create, manage, and execute payloads",
  },
  {
    label: "Activity Logs",
    href: "/logs",
    icon: <FileText className="w-5 h-5" />,
    description: "Centralized activity tracking",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: <Settings className="w-5 h-5" />,
    description: "System configuration",
  },
];

interface OffensiveSecurityLayoutProps {
  children: React.ReactNode;
}

export default function OffensiveSecurityLayout({ children }: OffensiveSecurityLayoutProps) {
  const { user, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin">
          <Shield className="w-8 h-8 text-accent" />
        </div>
      </div>
    );
  }

  if (!user) {
    // This shouldn't happen due to redirectOnUnauthenticated, but keep as fallback
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <Shield className="w-16 h-16 text-accent" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Offensive Security Portal
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            Unified Tool for Security Research
          </p>
          <Button
            onClick={() => (window.location.href = getLoginUrl())}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            Sign In to Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } bg-card border-r border-border transition-all duration-300 overflow-hidden flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-accent" />
            <div>
              <h1 className="text-lg font-bold text-foreground">SecOps</h1>
              <p className="text-xs text-muted-foreground">Research Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-card/50"
                  }`}
                  title={item.description}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-accent-foreground" />
                  )}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-border space-y-3">
          <div className="px-4 py-3 bg-card/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Logged in as</p>
            <p className="text-sm font-medium text-foreground truncate">
              {user.name || user.email || "User"}
            </p>
          </div>
          <Button
            onClick={logout}
            variant="ghost"
            className="w-full justify-start text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-card/50 rounded-lg transition-colors"
          >
            {sidebarOpen ? (
              <X className="w-5 h-5 text-foreground" />
            ) : (
              <Menu className="w-5 h-5 text-foreground" />
            )}
          </button>
          <div className="flex-1 ml-4">
            <h2 className="text-xl font-semibold text-foreground">
              {navItems.find((item) => item.href === location)?.label ||
                "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm text-muted-foreground">System Online</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
