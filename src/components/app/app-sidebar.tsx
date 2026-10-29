"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  BarChart3,
  ChevronsUpDown,
  CircleHelp,
  Images,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Monitor,
  Moon,
  Plug,
  Plus,
  Settings,
  Store,
  Sun,
  Upload,
  UserRound,
} from "lucide-react";
import type { Route } from "next";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";
import { Logo } from "./logo";

export interface SidebarData {
  workspaceName: string;
  isDemo: boolean;
  user: { name: string; email: string | null; image: string | null };
  needsReview: number;
  usageToday: number;
  usageLimit: number;
}

type NavItem = { href: Route; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string };

/**
 * One navigation for every size: a 248 px sidebar on desktop that
 * collapses to a 64 px icon rail, the rail on tablet, and a drawer on phone.
 */
export function AppSidebar({ data }: { data: SidebarData }) {
  const t = useTranslations("nav");
  const format = useFormatter();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnPhone = () => isMobile && setOpenMobile(false);

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t("work"),
      items: [
        { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
        {
          href: "/listings",
          label: t("listings"),
          icon: ListChecks,
          badge: data.needsReview ? format.number(data.needsReview) : undefined,
        },
        { href: "/bulk", label: t("bulk"), icon: Upload },
        { href: "/media", label: t("media"), icon: Images },
      ],
    },
    {
      label: t("shop"),
      items: [
        { href: "/connections", label: t("connections"), icon: Plug },
        {
          href: "/usage",
          label: t("usage"),
          icon: BarChart3,
          badge: `${format.number(data.usageToday)}/${format.number(data.usageLimit)}`,
        },
        { href: "/settings", label: t("settings"), icon: Settings },
      ],
    },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 p-3">
        <div className="flex h-9 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Logo className="size-7 shrink-0" />
          <span className="font-heading text-lg font-semibold group-data-[collapsible=icon]:hidden">ListSnap</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-sm group-data-[collapsible=icon]:hidden">
          <Store className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{data.workspaceName}</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("newListing")}
              isActive={pathname === "/snap"}
              className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground data-active:bg-primary data-active:text-primary-foreground"
              render={<Link href="/snap" onClick={closeOnPhone} />}
            >
              <Plus />
              <span>{t("newListing")}</span>
              <kbd className="ml-auto rounded border border-primary-foreground/30 px-1.5 text-[11px] opacity-80 group-data-[collapsible=icon]:hidden max-md:hidden">
                N
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g, i) => (
          <div key={g.label}>
            {i > 0 && <SidebarSeparator />}
            <SidebarGroup>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        tooltip={item.label}
                        isActive={isActive(item.href)}
                        className="h-10"
                        render={<Link href={item.href} onClick={closeOnPhone} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge && <SidebarMenuBadge className="top-2.5! font-mono">{item.badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("help")}
              isActive={isActive("/help")}
              className="h-10"
              render={<Link href="/help" onClick={closeOnPhone} />}
            >
              <CircleHelp />
              <span>{t("help")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ProfileMenu data={data} onNavigate={closeOnPhone} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ProfileMenu({ data, onNavigate }: { data: SidebarData; onNavigate: () => void }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const name = data.isDemo ? t("demoSeller") : data.user.name;
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const signOut = async () => {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <DropdownMenu>
      {/* no tooltip here: a tooltip trigger and a menu trigger can't share one element */}
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="h-12" aria-label={name} />}>
        <Avatar className="size-8">
          {data.user.image && <AvatarImage src={data.user.image} alt="" />}
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col text-left leading-tight">
          <span className="truncate text-sm font-medium">{name}</span>
          {data.user.email && <span className="truncate text-xs text-muted-foreground">{data.user.email}</span>}
        </span>
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem render={<Link href="/profile" onClick={onNavigate} />}>
          <UserRound />
          {t("profile")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun />
            {t("theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(String(v))}>
              <DropdownMenuRadioItem value="light">
                <Sun />
                {t("themeLight")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon />
                {t("themeDark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor />
                {t("themeSystem")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
