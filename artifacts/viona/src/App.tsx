import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { AppLayout } from '@/components/layout';
import { DashboardPage } from '@/pages/dashboard';
import { MarketsPage } from '@/pages/markets';
import { TradePage } from '@/pages/trade';
import { PortfolioPage } from '@/pages/portfolio';
import { OrdersPage } from '@/pages/orders';
import { WalletPage } from '@/pages/wallet';
import { ShieldPage } from '@/pages/shield';
import { DocsPage } from '@/pages/docs';
import { HomePage } from '@/pages/home';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/markets" component={MarketsPage} />
        <Route path="/trade" component={TradePage} />
        <Route path="/portfolio" component={PortfolioPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/wallet" component={WalletPage} />
        <Route path="/shield" component={ShieldPage} />
        <Route path="/docs" component={DocsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
