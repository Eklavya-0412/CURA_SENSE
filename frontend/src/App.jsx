import { useState } from 'react';
import { Layout, Users, Headphones } from 'lucide-react';
import AgentDashboard from './components/AgentDashboard';
import MerchantPortal from './components/MerchantPortal';

/**
 * Main App Component with view switching between:
 * 1. Support Dashboard (Server) - For support staff to review and approve AI responses
 * 2. Merchant Portal (Client) - For merchants to submit and track issues
 */
function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' or 'merchant'

  return (
    <div className="min-h-screen bg-gray-100">
      {/* View Toggle - Fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <Layout className="w-5 h-5 text-indigo-600" />
              <span className="font-bold text-gray-800">MigraGuard</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setView('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${view === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <Headphones className="w-4 h-4" />
                Support Dashboard
              </button>
              <button
                onClick={() => setView('merchant')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${view === 'merchant'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <Users className="w-4 h-4" />
                Merchant Portal
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - with top padding for fixed header */}
      <div className={view === 'merchant' ? '' : 'pt-14'}>
        {view === 'dashboard' ? <AgentDashboard /> : <MerchantPortal />}
      </div>
    </div>
  );
}

export default App;
