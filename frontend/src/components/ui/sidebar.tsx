/**
 * shadcn/ui Sidebar (trimmed port): collapsible to icons (⌘B), off-canvas sheet on mobile,
 * "inset" variant where the page sits in a rounded panel next to the sidebar.
 */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

const SIDEBAR_KEY = 'tokenomics.sidebar';
const SIDEBAR_WIDTH = '15rem';
const SIDEBAR_WIDTH_MOBILE = '17rem';
const SIDEBAR_WIDTH_ICON = '3rem';

type Ctx = { state: 'expanded' | 'collapsed'; open: boolean; setOpen: (o: boolean) => void; openMobile: boolean; setOpenMobile: (o: boolean) => void; isMobile: boolean; toggleSidebar: () => void };
const SidebarContext = React.createContext<Ctx | null>(null);

export function useSidebar() {
  const c = React.useContext(SidebarContext);
  if (!c) throw new Error('useSidebar must be used within a SidebarProvider.');
  return c;
}

function useIsMobile() {
  const [m, setM] = React.useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export const SidebarProvider = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { defaultOpen?: boolean }>(({ defaultOpen = true, className, style, children, ...props }, ref) => {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, _setOpen] = React.useState(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const setOpen = React.useCallback((o: boolean) => {
    _setOpen(o);
    try {
      localStorage.setItem(SIDEBAR_KEY, o ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);
  const toggleSidebar = React.useCallback(() => (isMobile ? setOpenMobile((o) => !o) : setOpen(!open)), [isMobile, open, setOpen]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  const value = React.useMemo<Ctx>(() => ({ state: open ? 'expanded' : 'collapsed', open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }), [open, setOpen, isMobile, openMobile, toggleSidebar]);

  return (
    <SidebarContext.Provider value={value}>
      <div
        ref={ref}
        style={{ '--sidebar-width': SIDEBAR_WIDTH, '--sidebar-width-icon': SIDEBAR_WIDTH_ICON, ...style } as React.CSSProperties}
        className={cn('group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
});
SidebarProvider.displayName = 'SidebarProvider';

export const Sidebar = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { variant?: 'sidebar' | 'floating' | 'inset'; collapsible?: 'offcanvas' | 'icon' | 'none' }>(
  ({ variant = 'sidebar', collapsible = 'icon', className, children, ...props }, ref) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
    if (isMobile)
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent side="left" className="w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden" style={{ '--sidebar-width': SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      );
    return (
      <div ref={ref} className="group peer hidden text-sidebar-foreground md:block" data-state={state} data-collapsible={state === 'collapsed' ? collapsible : ''} data-variant={variant}>
        <div
          className={cn(
            'relative w-[--sidebar-width] bg-transparent transition-[width] duration-200 ease-linear',
            'group-data-[collapsible=offcanvas]:w-0',
            variant === 'floating' || variant === 'inset' ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]' : 'group-data-[collapsible=icon]:w-[--sidebar-width-icon]',
          )}
        />
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] duration-200 ease-linear md:flex',
            'group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]',
            variant === 'floating' || variant === 'inset' ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]' : 'border-r group-data-[collapsible=icon]:w-[--sidebar-width-icon]',
            className,
          )}
          {...props}
        >
          <div data-sidebar="sidebar" className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow">
            {children}
          </div>
        </div>
      </div>
    );
  },
);
Sidebar.displayName = 'Sidebar';

export const SidebarTrigger = React.forwardRef<React.ElementRef<typeof Button>, React.ComponentProps<typeof Button>>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7', className)}
      onClick={(e) => {
        onClick?.(e);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

export const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<'main'>>(({ className, ...props }, ref) => (
  <main
    ref={ref}
    className={cn(
      'relative flex min-h-svh min-w-0 flex-1 flex-col bg-background',
      'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:min-h-0 md:peer-data-[variant=inset]:overflow-hidden md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:shadow-sm md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2',
      className,
    )}
    {...props}
  />
));
SidebarInset.displayName = 'SidebarInset';

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => <div ref={ref} data-sidebar="header" className={cn('flex flex-col gap-2 p-2', className)} {...props} />);
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => <div ref={ref} data-sidebar="footer" className={cn('flex flex-col gap-2 p-2', className)} {...props} />);
SidebarFooter.displayName = 'SidebarFooter';

export const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
  <div ref={ref} data-sidebar="content" className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden', className)} {...props} />
));
SidebarContent.displayName = 'SidebarContent';

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => <div ref={ref} data-sidebar="group" className={cn('relative flex w-full min-w-0 flex-col p-2', className)} {...props} />);
SidebarGroup.displayName = 'SidebarGroup';

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-label"
    className={cn('flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0', className)}
    {...props}
  />
));
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(({ className, ...props }, ref) => <ul ref={ref} data-sidebar="menu" className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />);
SidebarMenu.displayName = 'SidebarMenu';

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(({ className, ...props }, ref) => <li ref={ref} data-sidebar="menu-item" className={cn('group/menu-item relative', className)} {...props} />);
SidebarMenuItem.displayName = 'SidebarMenuItem';

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: { size: { default: 'h-8 text-sm', sm: 'h-7 text-xs', lg: 'h-12 text-sm group-data-[collapsible=icon]:!p-0' } },
    defaultVariants: { size: 'default' },
  },
);

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'> & { asChild?: boolean; isActive?: boolean; tooltip?: string } & VariantProps<typeof sidebarMenuButtonVariants>>(
  ({ asChild = false, isActive = false, size = 'default', tooltip, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const { isMobile, state } = useSidebar();
    const button = <Comp ref={ref} data-sidebar="menu-button" data-size={size} data-active={isActive} className={cn(sidebarMenuButtonVariants({ size }), className)} {...props} />;
    if (!tooltip) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" align="center" hidden={state !== 'collapsed' || isMobile}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

export const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="menu-badge"
    className={cn('pointer-events-none absolute right-1 top-1.5 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground group-data-[collapsible=icon]:hidden', className)}
    {...props}
  />
));
SidebarMenuBadge.displayName = 'SidebarMenuBadge';
