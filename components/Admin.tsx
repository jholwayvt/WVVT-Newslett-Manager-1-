

import React, { useState, useEffect } from 'react';
import { Database, Tag, Subscriber, SocialLink, SchemaComparisonReport } from '../types';
import { ICONS } from '../constants';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import * as dbService from '../services/dbService';
import CompanyProfileModal from './CompanyProfileModal';
import { SelectField } from './FormControls';

type SimpleDb = Omit<Database, 'subscribers' | 'tags' | 'campaigns'>;
type AppSubscriber = Subscriber & { tags: number[] };

interface AdminProps {
  db: dbService.DB;
  setDb: (db: dbService.DB) => void;
  databases: SimpleDb[];
  activeDatabaseId: number | null;
  setActiveDatabaseId: (id: number | null) => void;
  refreshData: () => Promise<void>;
  onRecreateDatabase: () => Promise<void>;
}

const Admin: React.FC<AdminProps> = ({ db, setDb, databases, activeDatabaseId, setActiveDatabaseId, refreshData, onRecreateDatabase }) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SimpleDb | null>(null);
  const [isMoverOpen, setIsMoverOpen] = useState(false);
  const [isRecreatingDb, setIsRecreatingDb] = useState(false);
  const [schemaReport, setSchemaReport] = useState<SchemaComparisonReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleCreate = () => {
    setEditingProfile(null);
    setIsProfileModalOpen(true);
  };

  const handleEdit = (dbItem: SimpleDb) => {
    setEditingProfile(dbItem);
    setIsProfileModalOpen(true);
  };

  const handleSaveDatabase = async (data: Omit<Database, 'id' | 'subscribers' | 'tags' | 'campaigns'> & { id?: number }) => {
    if (data.id) {
        await dbService.updateDatabase(db, data as SimpleDb);
    } else {
        const newDbInfo = await dbService.addDatabase(db, data);
        setActiveDatabaseId(newDbInfo.id);
    }
    await refreshData();
    setIsProfileModalOpen(false);
  };
  
  const handleDeleteDatabase = async (id: number) => {
    if (databases.length <= 1) {
      alert("You cannot delete the last database.");
      return;
    }
    if (window.confirm("Are you sure you want to permanently delete this database and all its data?")) {
      await dbService.deleteDatabase(db, id);
      if (activeDatabaseId === id) {
        const newDbs = databases.filter(dbItem => dbItem.id !== id);
        setActiveDatabaseId(newDbs[0]?.id || null);
      } else {
        await refreshData();
      }
    }
  };

  const handleExportSQLite = () => {
    const data = db.export();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `wvvt_backup_${new Date().toISOString()}.sqlite3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const handleImportSQLite = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const contents = e.target?.result as ArrayBuffer;
        const newDb = await dbService.loadDbFromExternalFile(new Uint8Array(contents));
        setDb(newDb);
        const dbs = await dbService.getDatabases(newDb);
        setActiveDatabaseId(dbs[0]?.id || null);
      } catch (error: any)
      {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleTestDbFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const contents = e.target?.result as ArrayBuffer;
            const tempDb = await dbService.loadDbFromExternalFile(new Uint8Array(contents));
            const report = await dbService.analyzeDatabaseSchema(tempDb);
            setSchemaReport(report);
            tempDb.close(); // Important: close the temporary DB
        } catch (error: any) {
            alert(`Analysis failed: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };


  const handleConfirmRecreate = async () => {
    await onRecreateDatabase();
    setIsRecreatingDb(false);
  };
  
  const downloadTemplate = (type: 'databases' | 'subscribers' | 'tags' | 'campaigns' | 'subscriber_tags' | 'sqlite') => {
    if (type === 'sqlite') {
        const blankDb = dbService.createBlankDb();
        const data = blankDb.export();
        const blob = new Blob([data], {type: 'application/octet-stream'});
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'blank_template.sqlite3';
        a.click();
        window.URL.revokeObjectURL(url);
        return;
    }
      
    const headers = {
        databases: 'id,name,description,logo_base64,street,city,state,zip_code,county,website,phone,fax_number,social_links_json,key_contact_name,key_contact_phone,key_contact_email',
        subscribers: 'id,database_id,email,name,subscribed_at,external_id',
        tags: 'id,database_id,name',
        campaigns: 'id,database_id,subject,body,sent_at,recipient_count,status,recipients_json,target_groups_json',
        subscriber_tags: 'subscriber_id,tag_id'
    };
    const content = `data:text/csv;charset=utf-8,${headers[type]}\n`;
    const encodedUri = encodeURI(content);
    dbService.downloadFile(`${type}_template.csv`, encodedUri, 'text/csv;charset=utf-8,');
  }

  const handleDownloadSeedScript = () => {
    const script = dbService.generateSeedSqlScript();
    dbService.downloadFile("sample_database_seed.sql", script, "application/sql");
  };

  const SocialIcons: React.FC<{ links: SocialLink[] }> = ({ links }) => {
    const getIcon = (platform: SocialLink['platform']) => {
        switch(platform) {
            case 'Facebook': return ICONS.facebook;
            case 'Twitter': return ICONS.twitter;
            case 'LinkedIn': return ICONS.linkedin;
            case 'Instagram': return ICONS.instagram;
            default: return ICONS.link;
        }
    }
    return (
        <div className="flex space-x-3">
            {links.map((link, index) => (
                <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-indigo-600" title={`${link.platform}: ${link.url}`}>
                    {getIcon(link.platform)}
                </a>
            ))}
        </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Admin: Database Management</h1>
      
      <div className="mb-8 p-6 bg-white rounded-xl shadow-md space-y-6">
        <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Database Actions</h2>
            <div className="flex flex-wrap gap-4">
              <button onClick={handleCreate} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700">{ICONS.plus}<span className="ml-2">Create New Company</span></button>
              <button onClick={() => setIsMoverOpen(true)} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md shadow-sm hover:bg-purple-700" disabled={databases.length < 2}>{ICONS.transfer}<span className="ml-2">Move Subscribers</span></button>
            </div>
        </div>
        <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Backup & Restore</h2>
            <div className="flex flex-wrap gap-4">
              <button onClick={handleExportSQLite} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700">{ICONS.download}<span className="ml-2">Save DB File (.sqlite3)</span></button>
              <label className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 cursor-pointer">{ICONS.upload}<span className="ml-2">Load DB File (.sqlite3)</span><input type='file' className="hidden" accept=".sqlite3,.db,.sqlite" onChange={handleImportSQLite} /></label>
              <label className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md shadow-sm hover:bg-gray-300 cursor-pointer">{ICONS.database}<span className="ml-2">{isAnalyzing ? 'Analyzing...' : 'Test Database File'}</span><input type='file' className="hidden" accept=".sqlite3,.db,.sqlite" onChange={handleTestDbFile} disabled={isAnalyzing} /></label>
              <button onClick={() => setIsRecreatingDb(true)} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md shadow-sm hover:bg-red-700">{ICONS.trash}<span className="ml-2">Recreate Database</span></button>
            </div>
        </div>
         <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Templates for Advanced Database Editing</h2>
            <p className="text-sm text-gray-600 mb-3">
                <strong className="text-red-600">For Advanced Users Only:</strong> Use these templates to populate a 
                <code className="text-xs bg-gray-200 p-1 rounded mx-1">blank_template.sqlite3</code> file externally.
                For standard subscriber imports, use the simpler template on the Subscribers page.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={handleDownloadSeedScript} className="px-3 py-1.5 text-xs font-medium text-white bg-gray-700 rounded-md hover:bg-gray-800">Sample Database Script (.sql)</button>
              <button onClick={() => downloadTemplate('sqlite')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Blank Database (.sqlite3)</button>
              <button onClick={() => downloadTemplate('databases')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Databases.csv</button>
              <button onClick={() => downloadTemplate('subscribers')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Subscribers.csv</button>
              <button onClick={() => downloadTemplate('tags')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Tags.csv</button>
            </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Available Companies</h2>
        {databases.map(dbItem => (
          <div key={dbItem.id} className={`p-4 bg-white rounded-xl shadow-md border-2 ${activeDatabaseId === dbItem.id ? 'border-indigo-500' : 'border-transparent'}`}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start space-x-4 flex-grow min-w-0">
                    {dbItem.logo_base64 ? 
                        <img src={dbItem.logo_base64} alt={`${dbItem.name} logo`} className="w-16 h-16 rounded-md object-cover flex-shrink-0" /> :
                        <div className="w-16 h-16 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs text-center p-1 flex-shrink-0">No Logo</div>
                    }
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm text-gray-600 flex-grow">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 truncate">{dbItem.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{dbItem.description}</p>
                            {dbItem.website && <p className="flex items-center mt-2"><strong>Web:</strong><a href={dbItem.website} target="_blank" rel="noopener noreferrer" className="ml-1 text-indigo-600 hover:underline flex items-center">{ICONS.link}<span className="ml-1 truncate w-48">{dbItem.website}</span></a></p>}
                            {dbItem.social_links && dbItem.social_links.length > 0 && <div className="mt-2"><SocialIcons links={dbItem.social_links} /></div>}
                        </div>
                        
                        <div>
                           <h4 className="font-semibold text-gray-800">Key Contact</h4>
                           <p>{dbItem.key_contact_name || 'N/A'}</p>
                           <p><strong>Phone:</strong> {dbItem.key_contact_phone || 'N/A'}</p>
                           <p><strong>Email:</strong> {dbItem.key_contact_email || 'N/A'}</p>
                        </div>

                         <div>
                           <h4 className="font-semibold text-gray-800">Address</h4>
                           <p>{dbItem.street || ''}</p>
                           <p>{dbItem.city || ''}{dbItem.city && dbItem.state ? ', ' : ''}{dbItem.state || ''} {dbItem.zip_code || ''}</p>
                           <p>{dbItem.county || ''}</p>
                        </div>
                        
                         <div>
                           <h4 className="font-semibold text-gray-800">Contact</h4>
                           <p><strong>Office:</strong> {dbItem.phone || 'N/A'}</p>
                           <p><strong>Fax:</strong> {dbItem.fax_number || 'N/A'}</p>
                        </div>

                    </div>
                </div>
                <div className="mt-4 sm:mt-0 flex flex-wrap gap-2 items-center flex-shrink-0 sm:ml-4">
                    <button onClick={() => handleEdit(dbItem)} className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200">Edit</button>
                    <button onClick={() => handleDeleteDatabase(dbItem.id)} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200">Delete</button>
                    <button onClick={() => setActiveDatabaseId(dbItem.id)} disabled={activeDatabaseId === dbItem.id} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-400">{activeDatabaseId === dbItem.id ? 'Active' : 'Activate'}</button>
                </div>
            </div>
          </div>
        ))}
      </div>

      {isProfileModalOpen && <CompanyProfileModal profileToEdit={editingProfile} onClose={() => setIsProfileModalOpen(false)} onSave={handleSaveDatabase} />}
      {isMoverOpen && <SubscriberMover db={db} databases={databases} onClose={() => setIsMoverOpen(false)} onComplete={refreshData} />}
      {isRecreatingDb && (
        <ConfirmationModal
            isOpen={isRecreatingDb}
            title="Recreate Entire Database?"
            message="WARNING: This is a destructive action. It will delete all companies, subscribers, and campaigns and create a new, blank database with default sample data. This cannot be undone."
            onConfirm={handleConfirmRecreate}
            onCancel={() => setIsRecreatingDb(false)}
            confirmText="Recreate"
        />
      )}
      {schemaReport && <SchemaReportModal report={schemaReport} onClose={() => setSchemaReport(null)} />}
    </div>
  );
};

const SchemaReportModal: React.FC<{ report: SchemaComparisonReport, onClose: () => void }> = ({ report, onClose }) => {
    const hasIssues = report.tables.some(t => t.isMissing || t.missingColumns.length > 0 || t.extraColumns.length > 0) || report.extraTables.length > 0;

    return (
        <Modal title="Database Schema Analysis Report" onClose={onClose} maxWidth="max-w-3xl">
            <div className="max-h-[70vh] overflow-y-auto space-y-4">
                {!hasIssues ? (
                    <div className="p-4 bg-green-50 text-green-800 rounded-md">
                        <h3 className="font-semibold">Schema looks good!</h3>
                        <p>The uploaded database schema matches the application's required schema. Any import issues are likely related to the data itself, not the structure.</p>
                    </div>
                ) : (
                    <div className="p-4 bg-yellow-50 text-yellow-800 rounded-md">
                        <h3 className="font-semibold">Schema differences found.</h3>
                        <p>The uploaded database has structural differences. This may cause errors on import. See details below.</p>
                    </div>
                )}
                {report.tables.map(table => (
                    <div key={table.name} className="p-3 border rounded-md">
                        <h4 className={`font-bold ${table.isMissing ? 'text-red-600' : 'text-gray-800'}`}>
                            Table: <code className="bg-gray-200 px-1 rounded">{table.name}</code>
                            {table.isMissing && <span className="ml-2">(MISSING)</span>}
                        </h4>
                        {!table.isMissing && (
                            <ul className="text-sm list-disc list-inside pl-4 mt-2">
                                {table.missingColumns.map(col => <li key={col.name} className="text-red-600">Missing column: <code className="bg-red-100">{col.name}</code> (Expected: {col.expected})</li>)}
                                {table.extraColumns.map(colName => <li key={colName} className="text-orange-600">Extra column: <code className="bg-orange-100">{colName}</code></li>)}
                                {table.missingColumns.length === 0 && table.extraColumns.length === 0 && <li className="text-green-600">Columns match.</li>}
                            </ul>
                        )}
                    </div>
                ))}
                {report.extraTables.length > 0 && (
                     <div className="p-3 border rounded-md">
                        <h4 className="font-bold text-orange-600">Extra Tables Found</h4>
                        <ul className="text-sm list-disc list-inside pl-4 mt-2">
                            {report.extraTables.map(tableName => <li key={tableName}>Found extra table: <code className="bg-orange-100">{tableName}</code></li>)}
                        </ul>
                    </div>
                )}
            </div>
             <div className="mt-6 flex justify-end">
                <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Close</button>
            </div>
        </Modal>
    );
};

// --- SUBSCRIBER MOVER COMPONENT ---
const SubscriberMover: React.FC<{
    db: dbService.DB;
    databases: SimpleDb[];
    onClose: () => void;
    onComplete: () => void;
}> = ({ db, databases, onClose, onComplete }) => {
    const [sourceDbId, setSourceDbId] = useState<number | null>(null);
    const [targetDbId, setTargetDbId] = useState<number | null>(null);
    const [sourceData, setSourceData] = useState<{ subscribers: AppSubscriber[], tags: Tag[] } | null>(null);
    const [selectedSubIds, setSelectedSubIds] = useState<number[]>([]);
    const [tagFilter, setTagFilter] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const loadSourceData = async () => {
            if (!sourceDbId) {
                setSourceData(null);
                return;
            }
            setIsLoading(true);
            const data = await dbService.getDatabaseContents(db, sourceDbId);
            setSourceData(data);
            setIsLoading(false);
        };
        loadSourceData();
    }, [sourceDbId, db]);

    const filteredSubscribers = sourceData?.subscribers.filter(s => 
        tagFilter ? s.tags.includes(tagFilter) : true
    ) || [];

    const handleTransfer = async (mode: 'copy' | 'move') => {
        if (!sourceDbId || !targetDbId || selectedSubIds.length === 0) {
            alert("Please select source, target, and at least one subscriber.");
            return;
        }
        if (sourceDbId === targetDbId) {
            alert("Source and Target companies must be different.");
            return;
        }

        setIsLoading(true);
        await dbService.transferSubscribers(db, {
            sourceDbId, targetDbId, subscriberIds: selectedSubIds, mode
        });
        setIsLoading(false);
        alert(`Successfully ${mode === 'copy' ? 'copied' : 'moved'} ${selectedSubIds.length} subscribers.`);
        onComplete();
        onClose();
    }

    return (
        <Modal title="Move / Copy Subscribers" onClose={onClose}>
            {isLoading && <p>Loading data...</p>}
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <SelectField label="Source Company" value={sourceDbId} onChange={setSourceDbId} options={databases} />
                    <SelectField label="Target Company" value={targetDbId} onChange={setTargetDbId} options={databases} />
                </div>

                {sourceData && (
                    <div>
                        <h3 className="font-semibold mb-2">Select Subscribers to Transfer</h3>
                        <SelectField label="Filter by Tag" value={tagFilter} onChange={setTagFilter} options={sourceData.tags} placeholder="All Tags" />

                        <div className="max-h-60 overflow-y-auto border rounded-md p-2 mt-2">
                            <label className="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 cursor-pointer">
                                <input type="checkbox"
                                    checked={selectedSubIds.length === filteredSubscribers.length && filteredSubscribers.length > 0}
                                    onChange={(e) => setSelectedSubIds(e.target.checked ? filteredSubscribers.map(s => s.id) : [])}
                                />
                                <span className="text-sm font-semibold">Select All</span>
                            </label>
                            {filteredSubscribers.map(sub => (
                                <label key={sub.id} className="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox"
                                        checked={selectedSubIds.includes(sub.id)}
                                        onChange={() => setSelectedSubIds(prev => prev.includes(sub.id) ? prev.filter(id => id !== sub.id) : [...prev, sub.id])}
                                    />
                                    <span className="text-sm">{sub.name} ({sub.email})</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{selectedSubIds.length} subscriber(s) selected.</p>
                    </div>
                )}
            </div>
            <div className="mt-6 flex justify-end space-x-3">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button onClick={() => handleTransfer('copy')} disabled={isLoading || selectedSubIds.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400">Copy to Target</button>
                <button onClick={() => handleTransfer('move')} disabled={isLoading || selectedSubIds.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400">Move to Target</button>
            </div>
        </Modal>
    )
}

export default Admin;