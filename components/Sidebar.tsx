import React from 'react';
import { View } from '../types';
import { ICONS } from '../constants';

interface SidebarProps {
  activeView: View;
  setActiveView: (view: View) => void;
  onLogout: () => void;
  onComposeNew: () => void;
  activeDatabaseName?: string;
  activeDatabaseLogo?: string;
}

const NavItem: React.FC<{
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
}> = ({ icon, label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center w-full px-4 py-3 text-sm font-medium text-left transition-colors duration-200 rounded-lg ${
        isActive
          ? 'bg-indigo-600 text-white'
          : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'
      }`}
    >
      {icon}
      <span className="ml-4">{label}</span>
    </button>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, onLogout, onComposeNew, activeDatabaseName, activeDatabaseLogo }) => {
  return (
    <aside className="flex flex-col w-64 h-screen bg-white shadow-xl p-4">
      <div className="flex flex-col items-center justify-center h-20 border-b">
        {activeDatabaseLogo ? (
            <img src={activeDatabaseLogo} alt={`${activeDatabaseName} logo`} className="max-h-14 max-w-full object-contain" />
        ) : (
            <h1 className="text-2xl font-bold text-indigo-600">WVVT</h1>
        )}
        {activeDatabaseName && <p className="text-xs text-gray-500 mt-1 truncate" title={activeDatabaseName}>DB: {activeDatabaseName}</p>}
      </div>
      <nav className="flex-1 mt-6 space-y-2">
        <NavItem
          icon={ICONS.dashboard}
          label="Dashboard"
          isActive={activeView === 'DASHBOARD'}
          onClick={() => setActiveView('DASHBOARD')}
        />
        <NavItem
          icon={ICONS.compose}
          label="Compose"
          isActive={activeView === 'COMPOSE'}
          onClick={onComposeNew}
        />
        <NavItem
          icon={ICONS.campaigns}
          label="Campaigns"
          isActive={activeView === 'CAMPAIGNS'}
          onClick={() => setActiveView('CAMPAIGNS')}
        />
        <div className="px-4 my-4">
            <hr className="border-t border-gray-200" />
            <span className="block mt-4 text-xs font-semibold text-gray-500 uppercase">Manage</span>
        </div>
        <NavItem
          icon={ICONS.admin}
          label="Admin"
          isActive={activeView === 'ADMIN'}
          onClick={() => setActiveView('ADMIN')}
        />
        <NavItem
          icon={ICONS.subscribers}
          label="Subscribers"
          isActive={activeView === 'SUBSCRIBERS'}
          onClick={() => setActiveView('SUBSCRIBERS')}
        />
        <NavItem
          icon={ICONS.tags}
          label="Tags"
          isActive={activeView === 'TAGS'}
          onClick={() => setActiveView('TAGS')}
        />
         <NavItem
          icon={ICONS.database}
          label="Data"
          isActive={activeView === 'DATA'}
          onClick={() => setActiveView('DATA')}
        />
      </nav>
      <div className="mt-auto">
        <NavItem icon={ICONS.logout} label="Logout" isActive={false} onClick={onLogout} />
      </div>
    </aside>
  );
};

export default Sidebar;