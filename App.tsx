
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Subscriber, Tag, Campaign, Database, AppSubscriber } from './types';
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
  
  // Use a ref to track sending status to prevent multiple concurrent scheduler runs
  const isSchedulerRunning = useRef(false);
  
  // Centralized initialization and data loading logic
  const initializeApp = useCallback(async () => {
    setIsLoading(true);
    try {
      const database = await dbService.initDB();
      setDb(database);
      const dbs = await dbService.getDatabases(database);
      let activeId = dbService.getActiveDbId();

      // Validate the stored active ID. If it doesn't exist in the current list of DBs, it's stale.
      if (activeId && !dbs.some(db => db.id === activeId)) {
        console.warn(`Stored active database ID ${activeId} was not found in the database. Clearing it.`);
        activeId = null;
        dbService.setActiveDbId(null);
      }

      // If there are databases but no active one is set, activate the first one.
      if (dbs.length > 0 && !activeId) {
        const newActiveId = dbs[0].id;
        dbService.setActiveDbId(newActiveId);
        setActiveDatabaseId(newActiveId);
      } else {
        setActiveDatabaseId(activeId);
      }
    } catch (error) {
      console.error("Failed to initialize database:", error);
      alert("Fatal Error: Could not initialize database. Please clear site data and try again.");
    }
  }, []);
  
  // Initial load on mount
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);
  
  // Load data whenever DB or active ID changes
  useEffect(() => {
    if (!db) return;

    const loadData = async () => {
      setIsLoading(true);
      const dbs = await dbService.getDatabases(db);
      let activeDbData: Database | null = null;
      if (activeDatabaseId) {
        try {
          activeDbData = await dbService.getDatabaseContents(db, activeDatabaseId);
        } catch (e) {
            console.warn(`Could not load database ID ${activeDatabaseId}, it may have been deleted. Resetting active DB.`, e);
            dbService.setActiveDbId(null);
            setActiveDatabaseId(null);
        }
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

  // --- Campaign Scheduler ---
  useEffect(() => {
    const checkAndSendScheduledCampaigns = async () => {
        if (!db || !appData.activeDb || isSchedulerRunning.current) {
            return;
        }

        isSchedulerRunning.current = true;

        try {
            const dueCampaigns = await dbService.getDueCampaigns(db, appData.activeDb.id);
            
            if (dueCampaigns.length > 0) {
                console.log(`Scheduler found ${dueCampaigns.length} campaign(s) to send.`);
                
                for (const campaign of dueCampaigns) {
                    // Fix: Pass the whole campaign.target object, not just the groups array.
                    const recipientIds = dbService.getRecipientIds(campaign.target, appData.activeDb.subscribers);
                    
                    // Mark as sending
                    await dbService.updateCampaign(db, { ...campaign, status: 'Sending', sent_at: new Date().toISOString() });
                    await refreshData();
                    
                    // Simulate send delay
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Mark as sent
                    await dbService.updateCampaign(db, {
                        ...campaign,
                        status: 'Sent',
                        sent_at: new Date().toISOString(),
                        recipient_count: recipientIds.length,
                        recipients: recipientIds,
                    });
                    await refreshData();
                }
            }
        } catch (error) {
            console.error("Error in scheduler:", error);
        } finally {
            isSchedulerRunning.current = false;
        }
    };

    // Check immediately on load, then every 30 seconds
    checkAndSendScheduledCampaigns();
    const interval = setInterval(checkAndSendScheduledCampaigns, 30000);

    return () => clearInterval(interval);
  }, [db, appData.activeDb, refreshData]);

  const handleSetDb = (newDb: dbService.DB) => {
    setDb(newDb);
    refreshData();
  }

  const handleSetActiveDbId = (id: number | null) => {
    dbService.setActiveDbId(id);
    setActiveDatabaseId(id);
  }
  
  const handleRecreateDatabase = async () => {
    if (db) {
      // Close the current DB connection if it exists to release file locks
      try {
        db.close();
      } catch (e) {
        console.warn("Could not close existing DB, it might already be closed.", e);
      }
    }
    localStorage.removeItem('wvvt_sqlite_db');
    localStorage.removeItem('wvvt_active_db_id');
    await initializeApp();
  };


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

  const unscheduleCampaign = async (id: number) => {
    if (!db || !appData.activeDb) return;
    const campaignToUnschedule = appData.activeDb.campaigns.find(c => c.id === id);
    if (campaignToUnschedule && campaignToUnschedule.status === 'Scheduled') {
        await dbService.updateCampaign(db, {
            ...campaignToUnschedule,
            status: 'Draft',
            scheduled_at: null,
        });
        await refreshData();
    }
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
        scheduled_at: null,
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
    if (isLoading || !db) {
        return <div className="text-center p-10">Loading Database...</div>;
    }
    
    if (activeView === 'ADMIN') {
       return <Admin 
          db={db}
          setDb={handleSetDb}
          databases={appData.databases}
          activeDatabaseId={activeDatabaseId}
          setActiveDatabaseId={handleSetActiveDbId}
          refreshData={refreshData}
          onRecreateDatabase={handleRecreateDatabase}
        />;
    }

    if (!appData.activeDb || !activeDatabaseId) {
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
        return <Campaigns 
            campaigns={campaigns} 
            subscribers={subscribers} 
            handleEdit={handleEditCampaign} 
            handleDelete={deleteCampaign} 
            handleClone={handleCloneCampaign}
            handleUnschedule={unscheduleCampaign}
        />;
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
