import { Activity, BookOpen, ChevronsUpDown, Command as CommandIcon, FlaskConical, KeyRound, LayoutDashboard, LogOut, Settings, Siren, Workflow } from 'lucide-react';
import { api, mockControls, SOURCE } from '../../api';
import { navigate } from '../../state/router';
import { useTraces } from '../../state/traces';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';

const MAIN = [
  { path: '/demo', title: 'Live demo', icon: Siren },
  { path: '/overview', title: 'Overview', icon: LayoutDashboard },
  { path: '/pipeline', title: 'Pipeline', icon: Workflow },
  { path: '/traces', title: 'Traces', icon: Activity },
];
const CONFIGURE = [
  { path: '/keys', title: 'API keys', icon: KeyRound },
  { path: '/settings', title: 'Settings', icon: Settings },
];

export const NAV_ITEMS = [...MAIN, ...CONFIGURE];

function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M4 7h7a4 4 0 0 1 4 4v2a4 4 0 0 0 4 4h1" />
      <path d="M4 17h3" />
    </svg>
  );
}

export function AppSidebar({ path, onOpenCommand }: { path: string; onOpenCommand: () => void }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { traces } = useTraces();
  const threats = traces.filter((t) => t.status === 'blocked' || t.status === 'honeypot').length;
  const go = (p: string) => {
    navigate(p);
    if (isMobile) setOpenMobile(false);
  };
  const host = SOURCE;

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Logo />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Tokenomics</span>
                    <span className="truncate text-xs text-muted-foreground">prod-gateway</span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56" align="start" side={isMobile ? 'bottom' : 'right'} sideOffset={4}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Environments</DropdownMenuLabel>
                <DropdownMenuItem className="gap-2">
                  <span className="h-2 w-2 rounded-full bg-efficiency" /> prod-gateway
                  <DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" /> staging
                  <DropdownMenuShortcut>⌘2</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Search" onClick={onOpenCommand} className="text-muted-foreground">
                <CommandIcon />
                <span>Search</span>
              </SidebarMenuButton>
              <SidebarMenuBadge className="text-muted-foreground">⌘K</SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="pt-0">
          <SidebarGroupLabel>Gateway</SidebarGroupLabel>
          <SidebarMenu>
            {MAIN.map((i) => (
              <SidebarMenuItem key={i.path}>
                <SidebarMenuButton tooltip={i.title} isActive={path === i.path} onClick={() => go(i.path)}>
                  <i.icon />
                  <span>{i.title}</span>
                </SidebarMenuButton>
                {i.path === '/traces' && threats > 0 && <SidebarMenuBadge className="text-danger">{threats}</SidebarMenuBadge>}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Configure</SidebarGroupLabel>
          <SidebarMenu>
            {CONFIGURE.map((i) => (
              <SidebarMenuItem key={i.path}>
                <SidebarMenuButton tooltip={i.title} isActive={path === i.path} onClick={() => go(i.path)}>
                  <i.icon />
                  <span>{i.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Docs" size="sm" className="text-muted-foreground">
                <a href="https://github.com/flamedrago8-apps/NASASpaceApps#readme" target="_blank" rel="noreferrer">
                  <BookOpen />
                  <span>Documentation</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-sidebar-accent text-xs">AD</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">Admin</span>
                    <span className="truncate text-xs text-muted-foreground">{host}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">Admin</div>
                  <div className="text-xs text-muted-foreground">{api.mode === 'mock' ? 'Simulated traffic in your browser' : `Connected to ${host}`}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => go('/keys')}>
                    <KeyRound /> API keys
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => go('/settings')}>
                    <Settings /> Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {mockControls && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        mockControls!.reset();
                        window.location.reload();
                      }}
                    >
                      <FlaskConical /> Reset demo data
                    </DropdownMenuItem>
                  </>
                )}
                {api.mode !== 'mock' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled>
                      <LogOut /> Sign out
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
