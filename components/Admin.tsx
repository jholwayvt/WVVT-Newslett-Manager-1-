import React, { useState, useEffect } from 'react';
import { Database, Tag, Subscriber, SocialLink } from '../types';
import { ICONS } from '../constants';
import Modal from './Modal';
import * as dbService from '../services/dbService';

type SimpleDb = Omit<Database, 'subscribers' | 'tags' | 'campaigns'>;
type AppSubscriber = Subscriber & { tags: number[] };

interface AdminProps {
  db: dbService.DB;
  setDb: (db: dbService.DB) => void;
  databases: SimpleDb[];
  activeDatabaseId: number | null;
  setActiveDatabaseId: (id: number | null) => void;
  refreshData: () => Promise<void>;
}

const Admin: React.FC<AdminProps> = ({ db, setDb, databases, activeDatabaseId, setActiveDatabaseId, refreshData }) => {
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [editingDatabase, setEditingDatabase] = useState<SimpleDb | null>(null);
  const [isMoverOpen, setIsMoverOpen] = useState(false);

  const handleCreate = () => {
    setEditingDatabase(null);
    setIsDbModalOpen(true);
  };

  const handleEdit = (dbItem: SimpleDb) => {
    setEditingDatabase(dbItem);
    setIsDbModalOpen(true);
  };

  const handleSaveDatabase = async (data: Omit<Database, 'id' | 'subscribers' | 'tags' | 'campaigns'> & { id?: number }) => {
    if (data.id) {
        await dbService.updateDatabase(db, data as SimpleDb);
    } else {
        const newDbInfo = await dbService.addDatabase(db, data);
        setActiveDatabaseId(newDbInfo.id);
    }
    await refreshData();
    setIsDbModalOpen(false);
  };
  
  const handleDeleteDatabase = async (id: number) => {
    if (databases.length <= 1) {
      alert("You cannot delete the last database.");
      return;
    }
    if (window.confirm("Are you sure you want to permanently delete this database and all its data?")) {
      await dbService.deleteDatabase(db, id);
      const newDbs = databases.filter(db => db.id !== id);
      if (activeDatabaseId === id) {
        setActiveDatabaseId(newDbs[0]?.id || null);
      }
      await refreshData();
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
        // After import, try to activate the first available DB.
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
  
  const downloadTemplate = (type: 'subscribers' | 'tags' | 'campaigns' | 'sqlite') => {
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
        subscribers: 'name,email,external_id,tags',
        tags: 'name',
        campaigns: 'subject,body'
    };
    const content = `data:text/csv;charset=utf-8,${headers[type]}\n`;
    const encodedUri = encodeURI(content);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${type}_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

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
            </div>
        </div>
         <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Templates</h2>
            <div className="flex flex-wrap gap-4">
              <button onClick={() => downloadTemplate('subscribers')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Subscribers.csv</button>
              <button onClick={() => downloadTemplate('tags')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Tags.csv</button>
              <button onClick={() => downloadTemplate('campaigns')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Campaigns.csv</button>
              <button onClick={() => downloadTemplate('sqlite')} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Blank Database.sqlite3</button>
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

      {isDbModalOpen && <DatabaseModal dbToEdit={editingDatabase} onClose={() => setIsDbModalOpen(false)} onSave={handleSaveDatabase} />}
      {isMoverOpen && <SubscriberMover db={db} databases={databases} onClose={() => setIsMoverOpen(false)} onComplete={refreshData} />}
    </div>
  );
};

const DatabaseModal: React.FC<{
  dbToEdit: SimpleDb | null;
  onClose: () => void;
  onSave: (data: Omit<SimpleDb, 'id'> & {id?: number}) => void;
}> = ({ dbToEdit, onClose, onSave }) => {
  const [data, setData] = useState<Omit<SimpleDb, 'id'> & {id?: number}>(
    dbToEdit || { name: '', description: '', social_links: [] }
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setData(prev => ({...prev, logo_base64: reader.result as string}));
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleSocialChange = (index: number, field: 'platform' | 'url', value: string) => {
    const newLinks = [...(data.social_links || [])];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setData(prev => ({ ...prev, social_links: newLinks }));
  };
  
  const addSocialLink = () => {
    if ((data.social_links?.length || 0) < 4) {
      setData(prev => ({...prev, social_links: [...(prev.social_links || []), {platform: 'Other', url: ''}]}));
    }
  }

  const removeSocialLink = (index: number) => {
    setData(prev => ({...prev, social_links: data.social_links?.filter((_, i) => i !== index)}));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.name.trim()) {
      onSave(data);
    }
  };

  return (
    <Modal title={dbToEdit ? 'Edit Company Profile' : 'Create New Company'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <InputField label="Company Name" value={data.name} onChange={val => setData(p => ({...p, name: val}))} required />
        <TextAreaField label="Description" value={data.description || ''} onChange={val => setData(p => ({...p, description: val}))} />
        <div>
          <label className="block text-sm font-medium text-gray-700">Logo</label>
          <div className="mt-1 flex items-center space-x-4">
            {data.logo_base64 && <img src={data.logo_base64} alt="logo preview" className="w-16 h-16 rounded-md object-cover" />}
            <input type="file" accept="image/*" onChange={handleFileChange} className="text-sm" />
          </div>
        </div>

        <hr/>
        <h3 className="text-lg font-semibold text-gray-800 pt-2">Contact Information</h3>
        <InputField label="Website URL" type="url" value={data.website || ''} onChange={val => setData(p => ({...p, website: val}))} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Phone Number" type="tel" value={data.phone || ''} onChange={val => setData(p => ({...p, phone: val}))} />
            <InputField label="Fax Number" type="tel" value={data.fax_number || ''} onChange={val => setData(p => ({...p, fax_number: val}))} />
        </div>
        
        <h4 className="font-semibold text-gray-700 pt-2">Address</h4>
        <InputField label="Street" value={data.street || ''} onChange={val => setData(p => ({...p, street: val}))} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="City" value={data.city || ''} onChange={val => setData(p => ({...p, city: val}))} />
          <InputField label="State / Province" value={data.state || ''} onChange={val => setData(p => ({...p, state: val}))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="Zip / Postal Code" value={data.zip_code || ''} onChange={val => setData(p => ({...p, zip_code: val}))} />
          <InputField label="County" value={data.county || ''} onChange={val => setData(p => ({...p, county: val}))} />
        </div>
        
        <hr/>
        <h3 className="text-lg font-semibold text-gray-800 pt-2">Key Contact</h3>
        <InputField label="Contact Name" value={data.key_contact_name || ''} onChange={val => setData(p => ({...p, key_contact_name: val}))} />
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Contact Phone" type="tel" value={data.key_contact_phone || ''} onChange={val => setData(p => ({...p, key_contact_phone: val}))} />
            <InputField label="Contact Email" type="email" value={data.key_contact_email || ''} onChange={val => setData(p => ({...p, key_contact_email: val}))} />
        </div>

        <hr/>
        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700">Social Media Links (Max 4)</label>
          <div className="space-y-2 mt-1">
            {data.social_links?.map((link, index) => (
              <div key={index} className="flex items-center space-x-2">
                <select value={link.platform} onChange={e => handleSocialChange(index, 'platform', e.target.value)} className="w-1/3 px-3 py-2 border border-gray-300 rounded-md text-sm">
                  {(['Facebook', 'Twitter', 'LinkedIn', 'Instagram', 'Other'] as SocialLink['platform'][]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="url" placeholder="https://..." value={link.url} onChange={e => handleSocialChange(index, 'url', e.target.value)} className="flex-grow px-3 py-2 border border-gray-300 rounded-md text-sm" />
                <button type="button" onClick={() => removeSocialLink(index)} className="text-red-500 hover:text-red-700 p-1">{ICONS.trash}</button>
              </div>
            ))}
             {(data.social_links?.length || 0) < 4 && <button type="button" onClick={addSocialLink} className="text-sm text-indigo-600 hover:underline">+ Add Link</button>}
          </div>
        </div>

        <div className="pt-4 flex justify-end space-x-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Save</button>
        </div>
      </form>
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

const SelectField: React.FC<{
    label: string, value: number | null,
    onChange: (id: number | null) => void,
    options: { id: number, name: string }[],
    placeholder?: string
}> = ({ label, value, onChange, options, placeholder }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <select value={value ?? ""} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
            <option value="">{placeholder || 'Select...'}</option>
            {options.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
        </select>
    </div>
);

const InputField: React.FC<{label: string, value: string, onChange: (val: string) => void, type?: string, required?: boolean}> = ({label, value, onChange, type="text", required=false}) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
    </div>
);

const TextAreaField: React.FC<{label: string, value: string, onChange: (val: string) => void}> = ({label, value, onChange}) => (
     <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
    </div>
);

export default Admin;