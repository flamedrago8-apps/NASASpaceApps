import { Component, useEffect, useState, type ReactNode } from 'react';
import { CONNECTED_AT_RUNTIME, checkGateway, resetLocalData, saveConnection } from './api';
import { AppSidebar } from './components/layout/AppSidebar';
import { CommandMenu } from './components/layout/CommandMenu';
import { ProfileProvider } from './components/ProfileSlider';
import { Button, CommandOpenContext, EmptyState } from './components/ui/kit';
import { SidebarInset, SidebarProvider } from './components/ui/sidebar';
import { TooltipProvider } from './components/ui/tooltip';
import { DemoPage } from './pages/DemoPage';
import { KeysPage } from './pages/KeysPage';
import { OverviewPage } from './pages/OverviewPage';
import { PipelinePage } from './pages/PipelinePage';
import { SettingsPage } from './pages/SettingsPage';
import { TracesPage } from './pages/TracesPage';
import { navigate, useRoute } from './state/router';
import { ToastProvider } from './state/toast';
import { TraceProvider } from './state/traces';

export default function App() {
  const route = useRoute();
  const [cmdOpen, setCmdOpen] = useState(false);
  let page: ReactNode;
  switch (route.path) {
    case '/demo':
      page = <DemoPage />;
      break;
    case '/overview':
      page = <OverviewPage />;
      break;
    case '/pipeline':
      page = <PipelinePage route={route} />;
      break;
    case '/traces':
      page = <TracesPage route={route} />;
      break;
    case '/keys':
      page = <KeysPage />;
      break;
    case '/settings':
      page = <SettingsPage />;
      break;
    default:
      page = <EmptyState title="Page not found" body={`Nothing lives at ${route.path}.`} action={<Button onClick={() => navigate('/overview')}>Go to overview</Button>} />;
  }

  return (
    <ToastProvider>
      <TraceProvider>
        <ProfileProvider>
          <TooltipProvider delayDuration={200}>
              <CommandOpenContext.Provider value={() => setCmdOpen(true)}>
                {/* shadcn dashboard-01 layout: inset sidebar + content panel */}
                <SidebarProvider>
                  <AppSidebar path={route.path} onOpenCommand={() => setCmdOpen(true)} />
                  <SidebarInset className="h-svh md:h-[calc(100svh-1rem)]">
                    <GatewayBanner />
                    <ErrorBoundary key={route.path}>
                      <div className="flex min-h-0 flex-1 flex-col">{page}</div>
                    </ErrorBoundary>
                  </SidebarInset>
                </SidebarProvider>
                <CommandMenu open={cmdOpen} setOpen={setCmdOpen} />
              </CommandOpenContext.Provider>
          </TooltipProvider>
        </ProfileProvider>
      </TraceProvider>
    </ToastProvider>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <EmptyState title="Something went wrong on this page" body={this.state.error.message} action={
            <div className="flex gap-2">
              <Button onClick={() => this.setState({ error: null })}>Try again</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  resetLocalData();
                  window.location.reload();
                }}
              >
                Reset demo data
              </Button>
            </div>
          }
        />
      );
    return this.props.children;
  }
}

/** Shown when the dashboard points at a gateway that isn't answering. */
function GatewayBanner() {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    checkGateway().then(setProblem);
  }, []);
  if (!problem) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
      <span className="flex-1">{problem} {CONNECTED_AT_RUNTIME ? 'It was connected from Settings in this browser.' : 'Check that the server is running.'}</span>
      {CONNECTED_AT_RUNTIME && (
        <Button
          size="sm"
          onClick={() => {
            saveConnection(null);
            window.location.reload();
          }}
        >
          Use demo data instead
        </Button>
      )}
    </div>
  );
}
