"use client";

import * as React from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  Store,
  Home,
  Package,
  ShoppingCart,
  Users,
  MessageSquare,
  BarChart3,
  FileText,
  Heart,
} from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMenuToggle?: () => void;
  showMenuButton?: boolean;
}

export function Header({ onMenuToggle, showMenuButton = true }: HeaderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isDark, setIsDark] = React.useState(false);
  const [showSearch, setShowSearch] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Quick navigation items for global search
  const quickLinks = [
    {
      label: "لوحة التحكم",
      href: "/merchant/dashboard",
      icon: Home,
      keywords: ["dashboard", "home", "الرئيسية"],
    },
    {
      label: "الطلبات",
      href: "/merchant/orders",
      icon: ShoppingCart,
      keywords: ["orders", "طلبات", "مبيعات"],
    },
    {
      label: "المخزون",
      href: "/merchant/inventory",
      icon: Package,
      keywords: ["inventory", "stock", "مخزون", "منتجات"],
    },
    {
      label: "المحادثات",
      href: "/merchant/conversations",
      icon: MessageSquare,
      keywords: ["chat", "conversations", "محادثات", "رسائل"],
    },
    {
      label: "العملاء",
      href: "/merchant/customers",
      icon: Users,
      keywords: ["customers", "clients", "عملاء"],
    },
    {
      label: "التقارير",
      href: "/merchant/reports",
      icon: BarChart3,
      keywords: ["reports", "analytics", "تقارير", "تحليلات"],
    },
    // { label: "الولاء", href: "/merchant/loyalty", icon: Heart, keywords: ["loyalty", "points", "ولاء", "نقاط"] }, // MARKETING_AGENT coming_soon
    {
      label: "الإعدادات",
      href: "/merchant/settings",
      icon: Settings,
      keywords: ["settings", "config", "إعدادات"],
    },
  ];

  // Filter links based on search query
  const filteredLinks = React.useMemo(() => {
    if (!searchQuery.trim()) return quickLinks;
    const q = searchQuery.toLowerCase();
    return quickLinks.filter(
      (link) =>
        link.label.toLowerCase().includes(q) ||
        link.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  // Handle keyboard shortcut (Cmd+K / Ctrl+K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape") {
        setShowSearch(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNavigate = (href: string) => {
    router.push(href);
    setShowSearch(false);
    setSearchQuery("");
  };

  // Get page title from pathname
  const getPageTitle = () => {
    const segments = pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    const titles: Record<string, string> = {
      dashboard: "لوحة التحكم",
      orders: "الطلبات",
      inventory: "المخزون",
      conversations: "المحادثات",
      customers: "العملاء",
      analytics: "التحليلات",
      loyalty: "الولاء",
      notifications: "الإشعارات",
      settings: "الإعدادات",
      team: "الفريق",
      reports: "التقارير",
      webhooks: "POS Integrations",
      "pos-integrations": "POS Integrations",
      audit: "سجل المراجعة",
    };

    return titles[lastSegment] || "لوحة التحكم";
  };

  // Get breadcrumb items
  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((segment, index) => {
      const href = "/" + segments.slice(0, index + 1).join("/");
      const labels: Record<string, string> = {
        merchant: "التاجر",
        admin: "المسؤول",
        dashboard: "لوحة التحكم",
        orders: "الطلبات",
        inventory: "المخزون",
        conversations: "المحادثات",
        customers: "العملاء",
        analytics: "التحليلات",
        loyalty: "الولاء",
        notifications: "الإشعارات",
        settings: "الإعدادات",
        "pos-integrations": "POS Integrations",
      };
      return {
        label: labels[segment] || segment,
        href,
        isLast: index === segments.length - 1,
      };
    });
  };

  const toggleDarkMode = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Left Section - Menu + Breadcrumbs */}
        <div className="flex items-center gap-4">
          {showMenuButton && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onMenuToggle}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* Breadcrumbs */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link
              href="/merchant/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="h-4 w-4" />
            </Link>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.href}>
                <span className="text-muted-foreground">/</span>
                {crumb.isLast ? (
                  <span className="font-medium text-foreground">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </nav>

          {/* Mobile Title */}
          <h1 className="text-lg font-semibold md:hidden">{getPageTitle()}</h1>
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={() => setShowSearch(true)}
            title="بحث (Ctrl+K)"
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Dark Mode Toggle */}
          <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {/* Notifications */}
          <NotificationBell />

          {/* Help */}
          <Link
            href="/merchant/settings#help"
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted transition-colors"
          >
            <HelpCircle className="h-5 w-5" />
          </Link>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 px-2 hover:bg-muted"
              >
                <Avatar
                  alt={session?.user?.name || "User"}
                  size="sm"
                  fallback={session?.user?.name?.charAt(0) || "U"}
                />
                <div className="hidden md:flex flex-col items-start text-right">
                  <span className="text-sm font-medium leading-none">
                    {session?.user?.name || "مستخدم"}
                  </span>
                  <span className="text-xs text-muted-foreground leading-none mt-0.5">
                    {session?.user?.email || "merchant@demo.com"}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {session?.user?.name || "مستخدم"}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {session?.user?.email || "merchant@demo.com"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/merchant/settings" className="cursor-pointer">
                  <User className="h-4 w-4 ml-2" />
                  الملف الشخصي
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/merchant/settings" className="cursor-pointer">
                  <Store className="h-4 w-4 ml-2" />
                  إعدادات المتجر
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/merchant/settings" className="cursor-pointer">
                  <Settings className="h-4 w-4 ml-2" />
                  الإعدادات
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 cursor-pointer focus:text-red-600 focus:bg-red-50"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-4 w-4 ml-2" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Breadcrumbs */}
      <div className="md:hidden px-4 pb-2 flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
        <Link href="/merchant/dashboard" className="hover:text-foreground">
          <Home className="h-3 w-3" />
        </Link>
        {breadcrumbs.slice(1).map((crumb, index) => (
          <React.Fragment key={crumb.href}>
            <span>/</span>
            {crumb.isLast ? (
              <span className="text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Global Search Dialog */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="ابحث عن صفحة أو أمر... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-0 focus-visible:ring-0 text-base"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredLinks.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                لا توجد نتائج
              </p>
            ) : (
              <div className="space-y-1">
                {filteredLinks.map((link) => (
                  <button
                    key={link.href}
                    onClick={() => handleNavigate(link.href)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-md text-right",
                      "hover:bg-muted transition-colors",
                      pathname === link.href && "bg-muted",
                    )}
                  >
                    <link.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="flex-1">{link.label}</span>
                    {pathname === link.href && (
                      <span className="text-xs text-muted-foreground">
                        الصفحة الحالية
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-2 border-t bg-muted/50">
            <p className="text-xs text-muted-foreground text-center">
              اضغط <kbd className="px-1 bg-background rounded border">↵</kbd>{" "}
              للانتقال أو{" "}
              <kbd className="px-1 bg-background rounded border">Esc</kbd>{" "}
              للإغلاق
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
