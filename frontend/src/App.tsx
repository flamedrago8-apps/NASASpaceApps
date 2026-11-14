import { ReactFlowProvider } from '@xyflow/react';
import { Component, type ReactNode } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TooltipProvider } from './components/ui/tooltip';
import { Button, EmptyState } from './components/ui/kit';
import { ProfileProvider } from './components/ProfileSlider';
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
        <ReactFlowProvider>
          <div className="flex h-[100dvh] w-full overflow-hidden bg-canvas text-fg">
            <Sidebar path={route.path} />
            <main className="min-w-0 flex-1">
              <ErrorBoundary key={route.path}>{page}</ErrorBoundary>
            </main>
          </div>
        </ReactFlowProvider>
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
      return <EmptyState title="Something went wrong on this page" body={this.state.error.message} action={<Button onClick={() => this.setState({ error: null })}>Try again</Button>} />;
    return this.props.children;
  }
}
