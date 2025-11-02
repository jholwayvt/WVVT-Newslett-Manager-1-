import React, { useState, useEffect, useCallback } from 'react';
import { View, Subscriber, Tag, Campaign, Database } from './types';
import * as dbService from './services/dbService';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Subscribers from './components/Subscribers';
import Tags from './components/Tags';
import Compose from './components/Compose';
import Campaigns from './components/Campaigns';
import DataManager from './components/DataManager';
import Admin from './components/Admin';

type AppData = {
    databases: Omit<Database, 'subscribers' | 'tags' | 'campaigns'>[];
    activeDb: Database | null;
}

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeView, setActiveView] = useState<View>('DASHBOARD');
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);

  // --- DB State Management ---
  const [db, setDb] = useState<dbService.DB | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [appData, setAppData] = useState<AppData>({ databases: [], activeDb: null });
  const [activeDatabaseId, setActiveDatabaseId] = useState<number | null>(null);
  
  // Initialize DB on mount
  useEffect(() => {
    const init = async () => {
      try {
        const database = await dbService.initDB();
        setDb(database);
        const activeId = dbService.getActiveDbId();
        // If there are databases but no active one, activate the first one.
        const dbs = await dbService.getDatabases(database);
        if (dbs.length > 0 && !activeId) {
            dbService.setActiveDbId(dbs[0].id);
            setActiveDatabaseId(dbs[0].id);
        } else {
            setActiveDatabaseId(activeId);
        }
      } catch (error) {
        console.error("Failed to initialize database:", error);
        alert("Fatal Error: Could not initialize database. Please clear site data and try again.");
      }
    };
    init();
  }, []);
  
  // Load data whenever DB or active ID changes
  useEffect(() => {
    if (!db) return;
    const loadData = async () => {
      setIsLoading(true);
      const dbs = await dbService.getDatabases(db);
      let activeDbData: Database | null = null;
      if (activeDatabaseId) {
        activeDbData = await dbService.getDatabaseContents(db, activeDatabaseId);
      }
      setAppData({ databases: dbs, activeDb: activeDbData });
      setIsLoading(false);
    };
    loadData();
  }, [db, activeDatabaseId]);

  const refreshData = useCallback(async () => {
    if (!db) return;
    dbService.saveDbToLocalStorage(db); // Save any pending changes
    const dbs = await dbService.getDatabases(db);
    const activeDbData = activeDatabaseId ? await dbService.getDatabaseContents(db, activeDatabaseId) : null;
    setAppData({ databases: dbs, activeDb: activeDbData });
  }, [db, activeDatabaseId]);

  const handleSetDb = (newDb: dbService.DB) => {
    setDb(newDb);
    refreshData();
  }

  const handleSetActiveDbId = (id: number | null) => {
    dbService.setActiveDbId(id);
    setActiveDatabaseId(id);
  }

  const handleLogin = () => setIsLoggedIn(true);
  const handleLogout = () => setIsLoggedIn(false);

  const addCampaign = async (campaign: Omit<Campaign, 'id'>): Promise<Campaign> => {
    if (!db || !appData.activeDb) throw new Error("No active database to add campaign to.");
    const newCampaign = await dbService.addCampaign(db, appData.activeDb.id, campaign);
    await refreshData();
    return newCampaign;
  };

  const updateCampaign = async (campaign: Campaign) => {
    if (!db) return;
    await dbService.updateCampaign(db, campaign);
    await refreshData();
  };

  const deleteCampaign = async (id: number) => {
    if (!db) return;
    await dbService.deleteCampaign(db, id);
    await refreshData();
  };
  
  const handleEditCampaign = (id: number) => {
    setEditingCampaignId(id);
    setActiveView('COMPOSE');
  };

  const handleCloneCampaign = async (id: number) => {
    if (!appData.activeDb) return;
    const campaignToClone = appData.activeDb.campaigns.find(c => c.id === id);
    if (!campaignToClone) return;

    const newDraft: Omit<Campaign, 'id'> = {
        ...campaignToClone,
        subject: `[CLONE] ${campaignToClone.subject}`,
        status: 'Draft',
        sent_at: null,
        recipient_count: 0,
        recipients: [],
    };

    const newCampaign = await addCampaign(newDraft);
    handleEditCampaign(newCampaign.id);
  };

  const handleComposeNew = () => {
    setEditingCampaignId(null);
    setActiveView('COMPOSE');
  };
  
  const changeView = (view: View) => {
    if (view !== 'COMPOSE') setEditingCampaignId(null);
    setActiveView(view);
  };

  const renderView = () => {
    if (isLoading) {
        return <div className="text-center p-10">Loading Database...</div>;
    }
    
    // FIX: Prioritize rendering the Admin view, as it's needed to select/create a database.
    if (activeView === 'ADMIN' && db) {
       return <Admin 
          db={db}
          setDb={handleSetDb}
          databases={appData.databases}
          activeDatabaseId={activeDatabaseId}
          setActiveDatabaseId={handleSetActiveDbId}
          refreshData={refreshData}
        />;
    }

    if (!appData.activeDb || !db || !activeDatabaseId) {
      return (
        <div className="text-center p-10">
          <h2 className="text-2xl font-bold text-gray-700">No Active Database</h2>
          <p className="text-gray-500 mt-2">Please go to the Admin section to create or activate a database.</p>
        </div>
      );
    }

    const { subscribers, tags, campaigns } = appData.activeDb;
    const campaignToEdit = editingCampaignId ? campaigns.find(c => c.id === editingCampaignId) : undefined;
    
    switch (activeView) {
      case 'DASHBOARD':
        return <Dashboard subscribers={subscribers} campaigns={campaigns} />;
      case 'SUBSCRIBERS':
        return <Subscribers 
            db={db}
            activeDatabaseId={activeDatabaseId}
            refreshData={refreshData}
            subscribers={subscribers} 
            tags={tags} 
            campaigns={campaigns} 
        />;
      case 'TAGS':
        return <Tags 
            db={db}
            activeDatabaseId={activeDatabaseId}
            refreshData={refreshData}
            tags={tags} 
            campaigns={campaigns} 
        />;
      case 'COMPOSE':
        return <Compose 
            subscribers={subscribers} 
            tags={tags} 
            addCampaign={addCampaign} 
            updateCampaign={updateCampaign}
            onFinish={() => setActiveView('CAMPAIGNS')} 
            campaignToEdit={campaignToEdit}
            campaigns={campaigns}
            onComposeNew={handleComposeNew}
            key={editingCampaignId || 'new'}
        />;
      case 'CAMPAIGNS':
        return <Campaigns campaigns={campaigns} subscribers={subscribers} handleEdit={handleEditCampaign} handleDelete={deleteCampaign} handleClone={handleCloneCampaign} />;
      case 'DATA':
        return <DataManager 
          db={db}
          refreshData={refreshData}
          databases={appData.databases}
          subscribers={subscribers}
          tags={tags}
          campaigns={campaigns}
        />;
      default:
        return <Dashboard subscribers={subscribers} campaigns={campaigns} />;
    }
  };

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar 
        activeView={activeView} 
        setActiveView={changeView} 
        onLogout={handleLogout} 
        onComposeNew={handleComposeNew}
        activeDatabaseName={appData.activeDb?.name} 
        activeDatabaseLogo={appData.activeDb?.logo_base64}
      />
      <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
        {renderView()}
      </main>
    </div>
  );
};

export default App;