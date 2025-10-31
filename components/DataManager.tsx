import React, { useState, useEffect } from 'react';
import { Subscriber, Tag, Campaign, ViewStackItem, TableName, PivotTarget, Database, SocialLink } from '../types';
import Modal from './Modal';
import { ICONS } from '../constants';
import * as dbService from '../services/dbService';

type AppSubscriber = Subscriber & { tags: number[] };
type SimpleDb = Omit<Database, 'subscribers' | 'tags' | 'campaigns'>;

// --- PROPS ---
interface DataManagerProps {
  db: dbService.DB;
  refreshData: () => Promise<void>;
  databases: SimpleDb[];
  subscribers: AppSubscriber[];
  setSubscribers: React.Dispatch<React.SetStateAction<AppSubscriber[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
}

// --- MAIN COMPONENT ---
const DataManager: React.FC<DataManagerProps> = (props) => {
  const [viewStack, setViewStack] = useState<ViewStackItem[]>([{ type: 'table', name: 'Subscribers' }]);
  const [editingItem, setEditingItem] = useState<{ table: TableName; item: AppSubscriber | Tag | Campaign } | null>(null);
  const [editingDatabase, setEditingDatabase] = useState<SimpleDb | null>(null);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);

  const currentView = viewStack[viewStack.length - 1];

  const pushView = (view: ViewStackItem) => setViewStack(prev => [...prev, view]);
  const goToView = (index: number) => setViewStack(prev => prev.slice(0, index + 1));
  
  const allData = {
    Subscribers: props.subscribers,
    Tags: props.tags,
    Campaigns: props.campaigns,
    Companies: props.databases,
  };

  const getFilteredData = () => {
    if (currentView.type === 'table') {
      return allData[currentView.name];
    }
    // Pivot view logic
    const { from, fromId, to } = currentView;
    if (from === 'Subscribers' && to === 'Tags') {
      const sub = props.subscribers.find(s => s.id === fromId);
      return sub ? props.tags.filter(t => sub.tags.includes(t.id)) : [];
    }
    if (from === 'Subscribers' && to === 'Campaigns') {
      return props.campaigns.filter(c => c.status === 'Sent' && c.recipients.includes(fromId));
    }
    if (from === 'Tags' && to === 'Subscribers') {
      return props.subscribers.filter(s => s.tags.includes(fromId));
    }
    if (from === 'Tags' && to === 'Campaigns') {
      return props.campaigns.filter(c => (c.status === 'Sent' || c.status === 'Draft') && c.target?.tags.includes(fromId));
    }
    if (from === 'Campaigns' && to === 'Subscribers') {
        const campaign = props.campaigns.find(c => c.id === fromId);
        return campaign ? props.subscribers.filter(s => campaign.recipients.includes(s.id)) : [];
    }
    if (from === 'Campaigns' && to === 'Tags') {
        const campaign = props.campaigns.find(c => c.id === fromId);
        return campaign ? props.tags.filter(t => campaign.target?.tags.includes(t.id)) : [];
    }
    return [];
  };

  const handleExport = () => {
    const dataToExport = getFilteredData();
    if(dataToExport.length === 0) {
      alert("No data in the current view to export.");
      return;
    }
    
    const headers = Object.keys(dataToExport[0]).filter(key => typeof dataToExport[0][key] !== 'object').join(',');
    const rows = dataToExport.map(item => 
      Object.entries(item)
        .filter(([key, val]) => typeof val !== 'object')
        .map(([key, val]) => Array.isArray(val) ? `"${val.join(';')}"` : `"${val}"`)
        .join(',')
    );
    
    let csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows.join('\n')}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `export_${currentView.type === 'table' ? currentView.name : currentView.to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleSaveItem = async (table: TableName, updatedItem: any) => {
    const { db, refreshData } = props;
    if (table === 'Subscribers') {
        await dbService.updateSubscriber(db, updatedItem);
    }
    if (table === 'Tags') {
        await dbService.updateTagWithRelations(db, updatedItem);
    }
    if (table === 'Campaigns') {
        await dbService.updateCampaign(db, updatedItem);
    }
    setEditingItem(null);
    await refreshData();
  }

   const handleSaveDatabase = async (data: SimpleDb) => {
      await dbService.updateDatabase(props.db, data);
      await props.refreshData();
      setIsDbModalOpen(false);
   };

  const renderCurrentView = () => {
    const data = getFilteredData();
    const handleEdit = (table: TableName, item: any) => setEditingItem({table, item});
    const handleDelete = async (table: TableName, id: number) => {
        if (!window.confirm(`Are you sure you want to delete this ${table.slice(0, -1)}?`)) return;
        if (table === 'Subscribers') await dbService.deleteSubscriber(props.db, id);
        if (table === 'Tags') await dbService.deleteTag(props.db, id);
        if (table === 'Campaigns') await dbService.deleteCampaign(props.db, id);
        await props.refreshData();
    }


    if (currentView.type === 'table') {
      switch (currentView.name) {
        case 'Subscribers':
          return <GenericTable title="Subscribers" data={data} columns={subscriberColumns(pushView)} onEdit={(item) => handleEdit('Subscribers', item)} onDelete={(id) => handleDelete('Subscribers', id)} />;
        case 'Tags':
          return <GenericTable title="Tags" data={data} columns={tagColumns(pushView)} onEdit={(item) => handleEdit('Tags', item)} onDelete={(id) => handleDelete('Tags', id)} />;
        case 'Campaigns':
          return <GenericTable title="Campaigns" data={data} columns={campaignColumns(pushView)} onEdit={(item) => handleEdit('Campaigns', item)} onDelete={(id) => handleDelete('Campaigns', id)} />;
        case 'Companies':
          return <GenericTable title="Companies" data={data} columns={companyColumns()} onEdit={(item) => {setEditingDatabase(item); setIsDbModalOpen(true);}} readOnlyActions={['delete']} />;
      }
    } else { // Pivot view
      return <PivotTable data={data} view={currentView} {...props} onPivot={pushView} />
    }
    return <p>No view to display.</p>;
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Data Manager</h1>
            <Breadcrumbs stack={viewStack} onNavigate={goToView} />
          </div>
          <div className="flex space-x-2">
            <button onClick={handleExport} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 inline-flex items-center">
                {ICONS.download}
                <span className="ml-2">Export View (CSV)</span>
            </button>
          </div>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        {(['Subscribers', 'Tags', 'Campaigns', 'Companies'] as TableName[]).map(name => (
          <button
            key={name}
            onClick={() => setViewStack([{ type: 'table', name }])}
            className={`px-4 py-2 text-sm font-medium ${
              currentView.type === 'table' && currentView.name === name
                ? 'border-b-2 border-indigo-500 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      
      {renderCurrentView()}
      
      {editingItem && (
          <EditModal 
            editingItem={editingItem}
            onClose={() => setEditingItem(null)}
            onSave={handleSaveItem}
            allData={props}
          />
      )}

      {isDbModalOpen && editingDatabase && (
        <DatabaseModal
          dbToEdit={editingDatabase}
          onClose={() => setIsDbModalOpen(false)}
          onSave={handleSaveDatabase}
        />
      )}
    </div>
  );
};


// --- BREADCRUMBS ---
const Breadcrumbs: React.FC<{ stack: ViewStackItem[], onNavigate: (index: number) => void }> = ({ stack, onNavigate }) => {
    const getCrumbName = (item: ViewStackItem) => {
        if (item.type === 'table') return item.name;
        const name = item.fromName.length > 20 ? item.fromName.substring(0, 20) + '...' : item.fromName;
        return `${name} > ${item.to}`;
    }
    return (
      <nav className="flex items-center text-sm font-medium text-gray-500 mt-1 flex-wrap">
        <button onClick={() => onNavigate(0)} className="hover:text-indigo-600">Data</button>
        {stack.slice(1).map((item, index) => (
          <React.Fragment key={index}>
            <span className="mx-2">/</span>
            <button onClick={() => onNavigate(index + 1)} className="hover:text-indigo-600 text-left">
              {getCrumbName(item)}
            </button>
          </React.Fragment>
        ))}
      </nav>
    );
};


// --- TABLE COMPONENTS ---

const subscriberColumns = (onPivot: Function) => [
    { header: 'ID', accessor: 'id' }, { header: 'Name', accessor: 'name' }, { header: 'Email', accessor: 'email' },
    { header: 'Pivot To', render: (item: Subscriber) => (
        <div className="space-x-2">
            <button onClick={() => onPivot({ type: 'pivot', from: 'Subscribers', fromId: item.id, fromName: item.name, to: 'Tags'})} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">Tags</button>
            <button onClick={() => onPivot({ type: 'pivot', from: 'Subscribers', fromId: item.id, fromName: item.name, to: 'Campaigns'})} className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Campaigns</button>
        </div>
    )}
];

const tagColumns = (onPivot: Function) => [
    { header: 'ID', accessor: 'id' }, { header: 'Name', accessor: 'name' },
    { header: 'Pivot To', render: (item: Tag) => (
        <div className="space-x-2">
            <button onClick={() => onPivot({ type: 'pivot', from: 'Tags', fromId: item.id, fromName: item.name, to: 'Subscribers'})} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">Subscribers</button>
            <button onClick={() => onPivot({ type: 'pivot', from: 'Tags', fromId: item.id, fromName: item.name, to: 'Campaigns'})} className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Campaigns</button>
        </div>
    )}
];

const campaignColumns = (onPivot: Function) => [
    { header: 'ID', accessor: 'id' }, { header: 'Subject', accessor: 'subject' }, { header: 'Status', accessor: 'status' },
    { header: 'Pivot To', render: (item: Campaign) => (
        <div className="space-x-2">
            <button onClick={() => onPivot({ type: 'pivot', from: 'Campaigns', fromId: item.id, fromName: item.subject, to: 'Subscribers'})} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded" disabled={item.status !== 'Sent'}>Recipients</button>
            <button onClick={() => onPivot({ type: 'pivot', from: 'Campaigns', fromId: item.id, fromName: item.subject, to: 'Tags'})} className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Target Tags</button>
        </div>
    )}
];

const companyColumns = () => [
    { header: 'ID', accessor: 'id' },
    { header: 'Name', accessor: 'name' },
    { header: 'Contact', accessor: 'key_contact_name' },
    { header: 'Phone', accessor: 'phone' },
    { header: 'Email', accessor: 'key_contact_email' },
];

const PivotTable: React.FC<{data: any[], view: ViewStackItem, onPivot: Function} & Omit<DataManagerProps, 'subscribers' | 'setSubscribers'>> = ({data, view, onPivot, db, refreshData}) => {
    if (view.type !== 'pivot') return null;

    let columns: any[] = [];
    let title = `${view.to} related to ${view.from} "${view.fromName}"`;

    const unlinkTagFromSubscriber = async (subId: number, tagId: number) => {
        await dbService.unlinkTagFromSubscriber(db, subId, tagId);
        await refreshData();
    }
    
    // Define columns based on pivot context
    if (view.to === 'Subscribers') columns = subscriberColumns(onPivot);
    if (view.to === 'Tags') {
        columns = tagColumns(onPivot);
        if (view.from === 'Subscribers') { // Add unlink action
            columns = columns.map(c => c.header !== 'Pivot To' ? c : { ...c, header: 'Actions', render: (item: Tag) => (
                <button onClick={() => unlinkTagFromSubscriber(view.fromId, item.id)} className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Unlink</button>
            )});
        }
    }
    if (view.to === 'Campaigns') columns = campaignColumns(onPivot);

    return <GenericTable title={title} data={data} columns={columns} readOnly={true} />
}


// --- GENERIC TABLE RENDERER ---
const GenericTable: React.FC<{title: string, data: any[], columns: any[], onDelete?: (id: number) => void, onEdit?: (item: any) => void, readOnly?: boolean, readOnlyActions?: ('edit' | 'delete')[]}> = ({ title, data, columns, onDelete, onEdit, readOnly = false, readOnlyActions = [] }) => (
    <div className="bg-white rounded-xl shadow-md overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    {columns.map(col => <th key={col.header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{col.header}</th>)}
                    {!readOnly && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>}
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map(item => (
                    <tr key={item.id}>
                        {columns.map(col => (
                            <td key={col.header} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                                {col.render ? col.render(item) : item[col.accessor]}
                            </td>
                        ))}
                        {!readOnly && (
                            <td className="px-4 py-3 whitespace-nowrap">
                                {!readOnlyActions.includes('edit') && <button onClick={() => onEdit && onEdit(item)} className="text-indigo-600 hover:text-indigo-900 mr-2">{ICONS.edit}</button>}
                                {!readOnlyActions.includes('delete') && <button onClick={() => onDelete && onDelete(item.id)} className="text-red-500 hover:text-red-700">{ICONS.trash}</button>}
                            </td>
                        )}
                    </tr>
                ))}
            </tbody>
        </table>
        {data.length === 0 && <p className="p-4 text-center text-gray-500">No items found.</p>}
    </div>
);


// --- EDIT MODAL & MULTI-SELECT ---
const EditModal: React.FC<{
    editingItem: { table: TableName; item: any };
    onClose: () => void;
    onSave: (table: TableName, item: any) => void;
    allData: DataManagerProps;
}> = ({ editingItem, onClose, onSave, allData }) => {
    const { table, item } = editingItem;
    const [formData, setFormData] = useState(item);

    useEffect(() => {
        // When editing a tag, we need to find its relationships to prepopulate the multi-selects
        if (table === 'Tags') {
            const relatedSubscribers = allData.subscribers.filter(s => s.tags.includes(item.id)).map(s => s.id);
            const relatedCampaigns = allData.campaigns.filter(c => c.status === 'Draft' && c.target.tags.includes(item.id)).map(c => c.id);
            setFormData({ ...item, subscribers: relatedSubscribers, campaigns: relatedCampaigns });
        } else {
            setFormData(item);
        }
    }, [item, table, allData]);

    const handleChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const renderForm = () => {
        switch (table) {
            case 'Subscribers':
                return <>
                    <InputField label="Name" value={formData.name} onChange={val => handleChange('name', val)} />
                    <InputField label="Email" type="email" value={formData.email} onChange={val => handleChange('email', val)} />
                    <MultiSelectCheckboxes 
                        label="Tags"
                        options={allData.tags.map(t => ({ id: t.id, name: t.name }))}
                        selectedIds={formData.tags}
                        onChange={ids => handleChange('tags', ids)}
                    />
                </>;
            case 'Tags':
                return <>
                    <InputField label="Name" value={formData.name} onChange={val => handleChange('name', val)} />
                    <MultiSelectCheckboxes 
                        label="Subscribers with this tag"
                        options={allData.subscribers.map(s => ({ id: s.id, name: s.name }))}
                        selectedIds={formData.subscribers}
                        onChange={ids => handleChange('subscribers', ids)}
                    />
                    <MultiSelectCheckboxes 
                        label="Draft campaigns targeting this tag"
                        options={allData.campaigns.filter(c => c.status === 'Draft').map(c => ({ id: c.id, name: c.subject }))}
                        selectedIds={formData.campaigns}
                        onChange={ids => handleChange('campaigns', ids)}
                    />
                </>;
            case 'Campaigns':
                return (
                    formData.status === 'Draft' ? <>
                        <InputField label="Subject" value={formData.subject} onChange={val => handleChange('subject', val)} />
                        <TextAreaField label="Body" value={formData.body} onChange={val => handleChange('body', val)} />
                        <MultiSelectCheckboxes 
                            label="Target Tags"
                            options={allData.tags.map(t => ({ id: t.id, name: t.name }))}
                            selectedIds={formData.target.tags}
                            onChange={ids => setFormData((p: any) => ({...p, target: {...p.target, tags: ids}}))}
                        />
                    </> : <p>Only draft campaigns can be edited here.</p>
                );
            default: return null;
        }
    }

    return (
        <Modal title={`Edit ${table.slice(0, -1)}`} onClose={onClose}>
            <div className="space-y-4">
                {renderForm()}
            </div>
            <div className="mt-6 flex justify-end space-x-2">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button onClick={() => onSave(table, formData)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700" disabled={table === 'Campaigns' && formData.status !== 'Draft'}>Save</button>
            </div>
        </Modal>
    );
};

const DatabaseModal: React.FC<{
  dbToEdit: SimpleDb;
  onClose: () => void;
  onSave: (data: SimpleDb) => void;
}> = ({ dbToEdit, onClose, onSave }) => {
  const [data, setData] = useState<SimpleDb>(dbToEdit);

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
    <Modal title='Edit Company Profile' onClose={onClose}>
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

const InputField: React.FC<{label: string, value: string, onChange: (val: string) => void, type?: string, required?: boolean}> = ({label, value, onChange, type="text", required=false}) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
    </div>
);

const TextAreaField: React.FC<{label: string, value: string, onChange: (val: string) => void}> = ({label, value, onChange}) => (
     <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={5} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-mono" />
    </div>
);

const MultiSelectCheckboxes: React.FC<{
    label: string,
    options: {id: number, name: string}[],
    selectedIds: number[],
    onChange: (ids: number[]) => void,
}> = ({ label, options, selectedIds, onChange }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredOptions = options.filter(opt => opt.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleToggle = (id: number) => {
        const newIds = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id];
        onChange(newIds);
    }
    
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
             <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md mb-2" />
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-1">
                {filteredOptions.map(opt => (
                    <label key={opt.id} className="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.includes(opt.id)} onChange={() => handleToggle(opt.id)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                        <span className="text-sm text-gray-800">{opt.name}</span>
                    </label>
                ))}
            </div>
        </div>
    );
};


export default DataManager;