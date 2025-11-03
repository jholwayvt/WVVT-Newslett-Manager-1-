

import React, { useState, useEffect } from 'react';
import { Subscriber, Tag, Campaign, ViewStackItem, TableName, PivotTarget, Database, AppSubscriber as AppSubscriberType } from '../types';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import { ICONS } from '../constants';
import * as dbService from '../services/dbService';
import { InputField, TextAreaField } from './FormControls';
import MultiSelectCheckboxes from './MultiSelectCheckboxes';
import CompanyProfileModal from './CompanyProfileModal';

type AppSubscriber = AppSubscriberType;
type SimpleDb = Omit<Database, 'subscribers' | 'tags' | 'campaigns'>;

// --- PROPS ---
interface DataManagerProps {
  db: dbService.DB;
  activeDatabaseId: number;
  refreshData: () => Promise<void>;
  databases: SimpleDb[];
  subscribers: AppSubscriber[];
  tags: Tag[];
  campaigns: Campaign[];
}

// --- MAIN COMPONENT ---
const DataManager: React.FC<DataManagerProps> = (props) => {
  const [viewStack, setViewStack] = useState<ViewStackItem[]>([{ type: 'table', name: 'Subscribers' }]);
  const [editingItem, setEditingItem] = useState<{ table: TableName; item: AppSubscriber | Tag | Campaign } | null>(null);
  const [editingCompanyProfile, setEditingCompanyProfile] = useState<SimpleDb | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // State for bulk editing
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const currentView = viewStack[viewStack.length - 1];

  // Clear selection when view changes
  useEffect(() => {
    setSelectedIds([]);
  }, [viewStack]);

  const pushView = (view: ViewStackItem) => setViewStack(prev => [...prev, view]);
  const goToView = (index: number) => setViewStack(prev => prev.slice(0, index + 1));
  
  const allData = {
    Subscribers: props.subscribers,
    Tags: props.tags,
    Campaigns: props.campaigns,
    Companies: props.databases,
  };

  const getFilteredData = (): any[] => {
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
      return props.campaigns.filter(c => (c.status === 'Sent' || c.status === 'Draft') && c.target?.groups?.some(g => g.tags.includes(fromId)));
    }
    if (from === 'Campaigns' && to === 'Subscribers') {
        const campaign = props.campaigns.find(c => c.id === fromId);
        return campaign ? props.subscribers.filter(s => campaign.recipients.includes(s.id)) : [];
    }
    if (from === 'Campaigns' && to === 'Tags') {
        const campaign = props.campaigns.find(c => c.id === fromId);
        const tagIdsInCampaign = new Set(campaign?.target?.groups.flatMap(g => g.tags) || []);
        return campaign ? props.tags.filter(t => tagIdsInCampaign.has(t.id)) : [];
    }
    return [];
  };

  const handleExport = () => {
    if (currentView.type !== 'table') {
        alert("Export is only available for main table views.");
        return;
    }
    const { name } = currentView;

    let headers: string[];
    let rows: any[][];
    const data = getFilteredData();
    if (data.length === 0) {
        alert("No data in the current view to export.");
        return;
    }

    if (name === 'Subscribers') {
        headers = ['id', 'name', 'email', 'external_id', 'subscribed_at', 'tags', 'notes'];
        rows = props.subscribers.map(sub => {
            const tagNames = sub.tags.map(tagId => props.tags.find(t => t.id === tagId)?.name).filter(Boolean);
            return [sub.id, sub.name, sub.email, sub.external_id || '', sub.subscribed_at, JSON.stringify(tagNames), sub.notes || ''];
        });
    } else {
        headers = Object.keys(data[0]);
        rows = data.map(item =>
            headers.map(header => {
                const value = item[header];
                if (typeof value === 'object' && value !== null) {
                    return JSON.stringify(value);
                }
                return value;
            })
        );
    }
    
    const filename = `export_${name}.csv`;
    const csvContent = dbService.generateCsvContent(headers, rows);
    dbService.downloadFile(filename, csvContent, "text/csv;charset=utf-8,");
  };

  const handleSaveItem = async (table: TableName, updatedItem: any) => {
    const { db, refreshData } = props;
    if (table === 'Subscribers') await dbService.updateSubscriber(db, updatedItem);
    if (table === 'Tags') await dbService.updateTagWithRelations(db, updatedItem);
    if (table === 'Campaigns') await dbService.updateCampaign(db, updatedItem);
    setEditingItem(null);
    await refreshData();
  }

   const handleSaveDatabase = async (data: SimpleDb) => {
      await dbService.updateDatabase(props.db, data);
      await props.refreshData();
      setIsProfileModalOpen(false);
   };
   
  const handleBulkDelete = async () => {
    if (currentView.type !== 'table') return;
    const tableName = currentView.name;
    await dbService.bulkDeleteItems(props.db, tableName, selectedIds);
    await props.refreshData();
    setSelectedIds([]);
    setIsBulkDeleteModalOpen(false);
  };

  const renderCurrentView = () => {
    const data = getFilteredData();
    const handleEdit = (table: TableName, item: any) => setEditingItem({table, item});

    const selectionProps = currentView.type === 'table' && currentView.name !== 'Companies' 
        ? { selectedIds, onSelectionChange: setSelectedIds, data } 
        : undefined;

    if (currentView.type === 'table') {
      switch (currentView.name) {
        case 'Subscribers':
          return <GenericTable title="Subscribers" data={data} columns={subscriberColumns(pushView)} onEdit={(item) => handleEdit('Subscribers', item)} selection={selectionProps} />;
        case 'Tags':
          return <GenericTable title="Tags" data={data} columns={tagColumns(pushView)} onEdit={(item) => handleEdit('Tags', item)} selection={selectionProps} />;
        case 'Campaigns':
          return <GenericTable title="Campaigns" data={data} columns={campaignColumns(pushView)} onEdit={(item) => handleEdit('Campaigns', item)} selection={selectionProps} />;
        case 'Companies':
          return <GenericTable title="Companies" data={data} columns={companyColumns()} onEdit={(item) => {setEditingCompanyProfile(item); setIsProfileModalOpen(true);}} readOnlyActions={['delete']} />;
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
            {currentView.type === 'table' && (
              <button onClick={() => setIsImportModalOpen(true)} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 inline-flex items-center">
                {ICONS.upload}
                <span className="ml-2">Import View (CSV)</span>
              </button>
            )}
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
      
      {selectedIds.length > 0 && currentView.type === 'table' && (
        <BulkActionBar
            count={selectedIds.length}
            tableName={currentView.name}
            onClear={() => setSelectedIds([])}
            onBulkEdit={() => setIsBulkEditModalOpen(true)}
            onBulkDelete={() => setIsBulkDeleteModalOpen(true)}
        />
      )}
      
      {renderCurrentView()}
      
      {editingItem && (
          <EditModal 
            editingItem={editingItem}
            onClose={() => setEditingItem(null)}
            onSave={handleSaveItem}
            allData={props}
          />
      )}

      {isProfileModalOpen && editingCompanyProfile && (
        <CompanyProfileModal
          profileToEdit={editingCompanyProfile}
          onClose={() => setIsProfileModalOpen(false)}
          onSave={handleSaveDatabase}
        />
      )}

      {isImportModalOpen && currentView.type === 'table' && (
        <ImportModal
          tableName={currentView.name}
          db={props.db}
          activeDatabaseId={props.activeDatabaseId}
          onClose={() => setIsImportModalOpen(false)}
          onComplete={async () => {
            setIsImportModalOpen(false);
            await props.refreshData();
          }}
        />
      )}

      {isBulkEditModalOpen && currentView.type === 'table' && currentView.name === 'Subscribers' && (
        <BulkEditSubscribersModal
            db={props.db}
            allTags={props.tags}
            subscriberIds={selectedIds}
            onClose={() => setIsBulkEditModalOpen(false)}
            onComplete={async () => {
                await props.refreshData();
                setSelectedIds([]);
                setIsBulkEditModalOpen(false);
            }}
        />
      )}
      {isBulkDeleteModalOpen && currentView.type === 'table' && (
        <ConfirmationModal
            isOpen={isBulkDeleteModalOpen}
            title={`Bulk Delete ${currentView.name}`}
            message={`Are you sure you want to permanently delete ${selectedIds.length} selected item(s)? This action cannot be undone.`}
            onConfirm={handleBulkDelete}
            onCancel={() => setIsBulkDeleteModalOpen(false)}
            confirmText="Delete"
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
    { header: 'Notes', render: (item: Subscriber) => <div className="max-w-xs truncate" title={item.notes}>{item.notes}</div> },
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

const companyColumns = () => [ { header: 'ID', accessor: 'id' }, { header: 'Name', accessor: 'name' }, { header: 'Contact', accessor: 'key_contact_name' }, { header: 'Phone', accessor: 'phone' }, { header: 'Email', accessor: 'key_contact_email' }, ];

const PivotTable: React.FC<{data: any[], view: ViewStackItem, onPivot: Function} & Omit<DataManagerProps, 'subscribers'>> = ({data, view, onPivot, db, refreshData}) => {
    if (view.type !== 'pivot') return null;

    let columns: any[] = [];
    let title = `${view.to} related to ${view.from} "${view.fromName}"`;

    const unlinkTagFromSubscriber = async (subId: number, tagId: number) => {
        await dbService.unlinkTagFromSubscriber(db, subId, tagId);
        await refreshData();
    }
    
    if (view.to === 'Subscribers') columns = subscriberColumns(onPivot);
    if (view.to === 'Tags') {
        columns = tagColumns(onPivot);
        if (view.from === 'Subscribers') {
            columns = columns.map(c => c.header !== 'Pivot To' ? c : { ...c, header: 'Actions', render: (item: Tag) => (
                <button onClick={() => unlinkTagFromSubscriber(view.fromId, item.id)} className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Unlink</button>
            )});
        }
    }
    if (view.to === 'Campaigns') columns = campaignColumns(onPivot);

    return <GenericTable title={title} data={data} columns={columns} readOnly={true} />
}


const GenericTable: React.FC<{
    title: string;
    data: any[];
    columns: any[];
    onEdit?: (item: any) => void;
    readOnly?: boolean;
    readOnlyActions?: ('edit' | 'delete')[];
    selection?: {
        selectedIds: number[];
        onSelectionChange: (ids: number[]) => void;
        data: any[];
    }
}> = ({ title, data, columns, onEdit, readOnly = false, readOnlyActions = [], selection }) => {
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selection) return;
        selection.onSelectionChange(e.target.checked ? selection.data.map(item => item.id) : []);
    };

    const handleSelectOne = (e: React.ChangeEvent<HTMLInputElement>, id: number) => {
        if (!selection) return;
        const { selectedIds, onSelectionChange } = selection;
        if (e.target.checked) onSelectionChange([...selectedIds, id]);
        else onSelectionChange(selectedIds.filter(i => i !== id));
    };
    
    const isAllSelected = selection ? selection.selectedIds.length === selection.data.length && selection.data.length > 0 : false;
    
    return (
    <div className="bg-white rounded-xl shadow-md overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    {selection && <th className="px-4 py-3"><input type="checkbox" className="h-4 w-4 text-indigo-600 border-gray-300 rounded" checked={isAllSelected} onChange={handleSelectAll} /></th>}
                    {columns.map(col => <th key={col.header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{col.header}</th>)}
                    {!readOnly && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>}
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map(item => (
                    <tr key={item.id} className={selection?.selectedIds.includes(item.id) ? 'bg-indigo-50' : ''}>
                        {selection && <td className="px-4 py-3"><input type="checkbox" className="h-4 w-4 text-indigo-600 border-gray-300 rounded" checked={selection.selectedIds.includes(item.id)} onChange={e => handleSelectOne(e, item.id)} /></td>}
                        {columns.map(col => (
                            <td key={col.header} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                                {col.render ? col.render(item) : item[col.accessor]}
                            </td>
                        ))}
                        {!readOnly && (
                            <td className="px-4 py-3 whitespace-nowrap">
                                {!readOnlyActions.includes('edit') && <button onClick={() => onEdit && onEdit(item)} className="text-indigo-600 hover:text-indigo-900 mr-2">{ICONS.edit}</button>}
                            </td>
                        )}
                    </tr>
                ))}
            </tbody>
        </table>
        {data.length === 0 && <p className="p-4 text-center text-gray-500">No items found.</p>}
    </div>
)};

// --- IMPORT MODAL ---
const ImportModal: React.FC<{
    tableName: TableName,
    db: dbService.DB,
    activeDatabaseId: number,
    onClose: () => void,
    onComplete: () => Promise<void>
}> = ({ tableName, db, activeDatabaseId, onClose, onComplete }) => {
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
    const [error, setError] = useState('');

    const instructions = {
        Subscribers: `Requires 'email' column. Updates existing subscribers based on email. 'tags' column should be a JSON array of strings, e.g., ["VIP", "New"]. 'notes' field can contain multi-line text. New tags are created automatically.`,
        Tags: `Requires 'name' column. Use 'id' column to update existing tags; otherwise, new tags will be created.`,
        Campaigns: `Use 'id' to update. Requires 'subject' and 'status'. JSON fields ('recipients_json', 'target_groups_json') must contain valid JSON strings.`,
        Companies: `Use 'id' to update existing company profiles. 'name' is required. 'social_links_json' must be a valid JSON array.`
    };

    const templates = {
        Subscribers: 'id,name,email,external_id,tags,notes\n1,"John Doe","john@example.com","ext123","[\"VIP\", \"New Customer\"]","This is a note about John."',
        Tags: 'id,name\n1,"VIP"',
        Campaigns: 'id,subject,status,body,target_groups_json,recipients_json\n1,"My Subject","Draft","<p>Hello</p>","{\\"groups\\":[],\\"groupsLogic\\":\\"AND\\"}","[]"',
        Companies: 'id,name,description\n1,"My Company","A description..."'
    };

    const handleDownloadTemplate = () => {
        dbService.downloadFile(`${tableName}_template.csv`, templates[tableName], 'text/csv;charset=utf-8,');
    };
    
    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportResult(null);
        setError('');

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            try {
                const result = await dbService.importDataFromCSV(db, tableName, activeDatabaseId, text);
                setImportResult(result);
                await onComplete();
            } catch (err: any) {
                setError(`Import failed: ${err.message}`);
                console.error(err);
            } finally {
                setImporting(false);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Allow re-uploading the same file
    };

    return (
        <Modal title={`Import ${tableName}`} onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <h4 className="font-semibold text-gray-800">Instructions</h4>
                    <p className="text-sm text-gray-600 mt-1">{instructions[tableName]}</p>
                </div>
                <div className="flex flex-wrap gap-4">
                    <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md shadow-sm hover:bg-gray-200">
                        {ICONS.download}
                        <span className="ml-2">Download Template</span>
                    </button>
                    <label className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm cursor-pointer ${importing ? 'bg-green-300' : 'bg-green-600 hover:bg-green-700'}`}>
                        {ICONS.upload}
                        <span className="ml-2">{importing ? 'Processing...' : 'Choose CSV File'}</span>
                        <input type='file' className="hidden" accept=".csv" onChange={handleImport} disabled={importing} />
                    </label>
                </div>
                {importing && <p className="text-center text-blue-600 font-semibold">Importing data, please wait...</p>}
                {error && <div className="mt-4 p-3 rounded-md bg-red-100 text-red-700 text-sm">{error}</div>}
                {importResult && (
                    <div className="mt-4 p-3 rounded-md bg-gray-100 text-sm">
                        <p className="font-semibold">Import Complete</p>
                        <p className="text-green-700">{importResult.success} rows successfully imported or updated.</p>
                        <p className="text-red-700">{importResult.failed} rows failed (e.g., missing required fields or malformed).</p>
                    </div>
                )}
            </div>
        </Modal>
    );
};


// --- BULK ACTION COMPONENTS ---
const BulkActionBar: React.FC<{
    count: number;
    tableName: TableName;
    onClear: () => void;
    onBulkEdit: () => void;
    onBulkDelete: () => void;
}> = ({ count, tableName, onClear, onBulkEdit, onBulkDelete }) => (
    <div className="fixed bottom-5 right-5 z-40 bg-white p-4 rounded-lg shadow-2xl flex items-center space-x-4 border border-gray-200 animate-fade-in-up">
        <span className="text-sm font-semibold text-gray-800">{count} {tableName} selected</span>
        {tableName === 'Subscribers' && <button onClick={onBulkEdit} className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Bulk Edit Tags</button>}
        {tableName !== 'Companies' && <button onClick={onBulkDelete} className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700">Delete</button>}
        <button onClick={onClear} className="text-gray-500 hover:text-gray-800 text-sm font-medium">Cancel</button>
    </div>
);

const BulkEditSubscribersModal: React.FC<{
    db: dbService.DB;
    allTags: Tag[];
    subscriberIds: number[];
    onClose: () => void;
    onComplete: () => void;
}> = ({ db, allTags, subscriberIds, onClose, onComplete }) => {
    const [mode, setMode] = useState<'add' | 'remove' | 'reset'>('add');
    const [tagsToAdd, setTagsToAdd] = useState<number[]>([]);
    const [tagsToRemove, setTagsToRemove] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    
    const handleSave = async () => {
        setIsSaving(true);
        await dbService.bulkUpdateSubscriberTags(db, subscriberIds, tagsToAdd, tagsToRemove, mode);
        setIsSaving(false);
        onComplete();
    };

    return (
        <Modal title={`Bulk Edit ${subscriberIds.length} Subscribers`} onClose={onClose}>
            <div className="flex border-b">
                <button onClick={() => setMode('add')} className={`px-4 py-2 text-sm ${mode === 'add' ? 'border-b-2 border-indigo-500 font-semibold' : ''}`}>Add Tags</button>
                <button onClick={() => setMode('remove')} className={`px-4 py-2 text-sm ${mode === 'remove' ? 'border-b-2 border-indigo-500 font-semibold' : ''}`}>Remove Tags</button>
                <button onClick={() => setMode('reset')} className={`px-4 py-2 text-sm ${mode === 'reset' ? 'border-b-2 border-indigo-500 font-semibold' : ''}`}>Reset Tags</button>
            </div>
            <div className="py-4 space-y-4">
                {mode === 'add' && <MultiSelectCheckboxes label="Tags to Add" options={allTags} selectedIds={tagsToAdd} onChange={setTagsToAdd} />}
                {mode === 'remove' && <MultiSelectCheckboxes label="Tags to Remove" options={allTags} selectedIds={tagsToRemove} onChange={setTagsToRemove} />}
                {mode === 'reset' && <MultiSelectCheckboxes label="Set Tags To" options={allTags} selectedIds={tagsToAdd} onChange={setTagsToAdd} />}
            </div>
             <div className="mt-6 flex justify-end space-x-3">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                    {isSaving ? 'Saving...' : 'Apply Changes'}
                </button>
            </div>
        </Modal>
    );
};

// --- EDIT MODAL & FORM FIELDS ---
const EditModal: React.FC<{
    editingItem: { table: TableName; item: any };
    onClose: () => void;
    onSave: (table: TableName, item: any) => void;
    allData: Omit<DataManagerProps, 'setSubscribers' | 'setTags' | 'setCampaigns'>;
}> = ({ editingItem, onClose, onSave, allData }) => {
    const { table, item } = editingItem;
    const [formData, setFormData] = useState(item);

    useEffect(() => {
        if (table === 'Tags') {
            const relatedSubscribers = allData.subscribers.filter(s => s.tags.includes(item.id)).map(s => s.id);
            const relatedCampaigns = allData.campaigns.filter(c => c.status === 'Draft' && c.target.groups?.some(g => g.tags.includes(item.id))).map(c => c.id);
            setFormData({ ...item, subscribers: relatedSubscribers, campaigns: relatedCampaigns });
        } else {
            setFormData(item);
        }
    }, [item, table, allData]);

    const handleChange = (field: string, value: any) => setFormData((prev: any) => ({ ...prev, [field]: value }));

    const renderForm = () => {
        switch (table) {
            case 'Subscribers': return <> <InputField label="Name" value={formData.name} onChange={val => handleChange('name', val)} /> <InputField label="Email" type="email" value={formData.email} onChange={val => handleChange('email', val)} /> <TextAreaField label="Notes" value={formData.notes || ''} onChange={val => handleChange('notes', val)} /> <MultiSelectCheckboxes label="Tags" options={allData.tags} selectedIds={formData.tags} onChange={ids => handleChange('tags', ids)} /> </>;
            case 'Tags': return <> <InputField label="Name" value={formData.name} onChange={val => handleChange('name', val)} /> <MultiSelectCheckboxes label="Subscribers with this tag" options={allData.subscribers} selectedIds={formData.subscribers || []} onChange={ids => handleChange('subscribers', ids)} /> <MultiSelectCheckboxes label="Draft campaigns targeting this tag" options={allData.campaigns.filter(c => c.status === 'Draft').map(c => ({ id: c.id, name: c.subject }))} selectedIds={formData.campaigns || []} onChange={ids => handleChange('campaigns', ids)} /> </>;
            case 'Campaigns': return (formData.status === 'Draft' ? <> <InputField label="Subject" value={formData.subject} onChange={val => handleChange('subject', val)} /> <TextAreaField label="Body" value={formData.body} onChange={val => handleChange('body', val)} /> <TextAreaField label="Target Groups (JSON)" value={JSON.stringify(formData.target.groups, null, 2)} onChange={val => { try { const groups = JSON.parse(val); if (Array.isArray(groups)) { setFormData((p: any) => ({...p, target: {...p.target, groups: groups}})) } } catch (e) {} }} /> </> : <p>Only draft campaigns can be edited here.</p>);
            default: return null;
        }
    }

    return (
        <Modal title={`Edit ${table.slice(0, -1)}`} onClose={onClose}>
            <div className="space-y-4">{renderForm()}</div>
            <div className="mt-6 flex justify-end space-x-2"> <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button> <button onClick={() => onSave(table, formData)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700" disabled={table === 'Campaigns' && formData.status !== 'Draft'}>Save</button> </div>
        </Modal>
    );
};

export default DataManager;