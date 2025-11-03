
import React, { useState, useMemo } from 'react';
import { AppSubscriber, Tag, Campaign } from '../types';
import { ICONS } from '../constants';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import * as dbService from '../services/dbService';
import MultiSelectCheckboxes from './MultiSelectCheckboxes';

interface SubscribersProps {
  db: dbService.DB;
  activeDatabaseId: number;
  refreshData: () => Promise<void>;
  subscribers: AppSubscriber[];
  tags: Tag[];
  campaigns: Campaign[];
}

const Subscribers: React.FC<SubscribersProps> = ({ db, activeDatabaseId, refreshData, subscribers, tags, campaigns }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubscriber, setEditingSubscriber] = useState<AppSubscriber | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [historySubscriber, setHistorySubscriber] = useState<AppSubscriber | null>(null);
  const [isImportExportOpen, setImportExportOpen] = useState(false);
  const [deletingSubscriber, setDeletingSubscriber] = useState<AppSubscriber | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for bulk actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const handleAdd = () => {
    setEditingSubscriber(null);
    setIsModalOpen(true);
  };

  const handleEdit = (subscriber: AppSubscriber) => {
    setEditingSubscriber(subscriber);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (subscriber: AppSubscriber) => {
    setDeletingSubscriber(subscriber);
  };
  
  const handleConfirmDelete = async () => {
    if (!deletingSubscriber) return;
    setIsDeleting(true);
    await dbService.deleteSubscriber(db, deletingSubscriber.id);
    await refreshData();
    setIsDeleting(false);
    setDeletingSubscriber(null);
  };

  const handleSave = async (subscriberData: Omit<AppSubscriber, 'id' | 'subscribed_at'> & { id?: number }) => {
    if (subscriberData.id) {
      await dbService.updateSubscriber(db, subscriberData as AppSubscriber);
    } else {
      await dbService.addSubscriber(db, activeDatabaseId, subscriberData);
    }
    await refreshData();
    setIsModalOpen(false);
  };
  
  const filteredSubscribers = subscribers.filter(s => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    const nameMatch = s.name.toLowerCase().includes(lowerCaseSearchTerm);
    const emailMatch = s.email.toLowerCase().includes(lowerCaseSearchTerm);

    const tagMatch = s.tags.some(tagId => {
      const tag = tags.find(t => t.id === tagId);
      return tag && tag.name.toLowerCase().includes(lowerCaseSearchTerm);
    });

    return nameMatch || emailMatch || tagMatch;
  });

  // Handlers for bulk actions
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? filteredSubscribers.map(s => s.id) : []);
  };

  const handleSelectOne = (id: number, isSelected: boolean) => {
    if (isSelected) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(subId => subId !== id));
    }
  };

  const handleBulkDelete = async () => {
    await dbService.bulkDeleteItems(db, 'Subscribers', selectedIds);
    await refreshData();
    setSelectedIds([]);
    setIsBulkDeleteModalOpen(false);
  };

  const isAllSelected = selectedIds.length === filteredSubscribers.length && filteredSubscribers.length > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">Subscribers</h1>
            <p className="mt-1 text-gray-600">Manage your mailing list.</p>
        </div>
        <div className="flex space-x-2">
           <button
             onClick={() => setImportExportOpen(true)}
             className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
           >
              Import / Export
            </button>
            <button
              onClick={handleAdd}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {ICONS.plus}
              <span className="ml-2">Add Subscriber</span>
            </button>
        </div>
      </div>

       <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or tag..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3">
                <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    aria-label="Select all subscribers"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subscribed On</th>
              <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSubscribers.map(subscriber => (
              <tr key={subscriber.id} className={`hover:bg-gray-50 ${selectedIds.includes(subscriber.id) ? 'bg-indigo-50' : ''}`}>
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(subscriber.id)}
                    onChange={(e) => handleSelectOne(subscriber.id, e.target.checked)}
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    aria-label={`Select ${subscriber.name}`}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{subscriber.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{subscriber.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex flex-wrap gap-1">
                    {subscriber.tags.map(tagId => {
                      const tag = tags.find(t => t.id === tagId);
                      return tag ? <span key={tagId} className="px-2 py-1 text-xs font-semibold text-indigo-800 bg-indigo-100 rounded-full">{tag.name}</span> : null;
                    })}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={subscriber.notes || ''}>
                  {subscriber.notes}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(subscriber.subscribed_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button onClick={() => setHistorySubscriber(subscriber)} className="text-gray-500 hover:text-gray-800 p-1" title="View History">{ICONS.history}</button>
                  <button onClick={() => handleEdit(subscriber)} className="text-indigo-600 hover:text-indigo-900 p-1" title="Edit">{ICONS.edit}</button>
                  <button onClick={() => handleDeleteClick(subscriber)} className="text-red-600 hover:text-red-900 p-1" title="Delete">{ICONS.trash}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <SubscriberModal
          key={editingSubscriber?.id || 'new-subscriber'}
          subscriber={editingSubscriber}
          allTags={tags}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}
      {historySubscriber && (
        <SubscriberHistoryModal
            subscriber={historySubscriber}
            campaigns={campaigns}
            onClose={() => setHistorySubscriber(null)}
        />
      )}
      {isImportExportOpen && (
        <ImportExportModal
          db={db}
          activeDatabaseId={activeDatabaseId}
          refreshData={refreshData}
          subscribers={subscribers}
          tags={tags}
          onClose={() => setImportExportOpen(false)}
        />
      )}
      {deletingSubscriber && (
        <ConfirmationModal
            isOpen={!!deletingSubscriber}
            title="Delete Subscriber"
            message={`Are you sure you want to permanently delete ${deletingSubscriber.name} (${deletingSubscriber.email})? This action cannot be undone.`}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeletingSubscriber(null)}
            confirmText="Delete"
            isConfirming={isDeleting}
        />
      )}

      {/* Bulk Action UI */}
      {selectedIds.length > 0 && (
        <BulkActionBar
            count={selectedIds.length}
            onEditTags={() => setIsBulkEditModalOpen(true)}
            onDelete={() => setIsBulkDeleteModalOpen(true)}
            onClear={() => setSelectedIds([])}
        />
      )}

      {isBulkEditModalOpen && (
        <BulkEditTagsModal
            db={db}
            allTags={tags}
            subscriberIds={selectedIds}
            onClose={() => setIsBulkEditModalOpen(false)}
            onComplete={async () => {
                await refreshData();
                setSelectedIds([]);
                setIsBulkEditModalOpen(false);
            }}
        />
      )}

      {isBulkDeleteModalOpen && (
          <ConfirmationModal
              isOpen={isBulkDeleteModalOpen}
              title={`Bulk Delete Subscribers`}
              message={`Are you sure you want to permanently delete ${selectedIds.length} selected subscriber(s)? This action cannot be undone.`}
              onConfirm={handleBulkDelete}
              onCancel={() => setIsBulkDeleteModalOpen(false)}
              confirmText="Delete"
          />
      )}
    </div>
  );
};

const SubscriberModal: React.FC<{
  subscriber: AppSubscriber | null;
  allTags: Tag[];
  onClose: () => void;
  onSave: (data: Omit<AppSubscriber, 'subscribed_at'>) => Promise<void>;
}> = ({ subscriber, allTags, onClose, onSave }) => {
  const [name, setName] = useState(subscriber?.name || '');
  const [email, setEmail] = useState(subscriber?.email || '');
  const [externalId, setExternalId] = useState(subscriber?.external_id || '');
  const [notes, setNotes] = useState(subscriber?.notes || '');
  const [selectedTags, setSelectedTags] = useState<number[]>(subscriber?.tags || []);
  const [emailError, setEmailError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleTagToggle = (tagId: number) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const validateEmail = (email: string): string => {
    if (!email) {
      return "Email is required.";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address.';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateEmail(email);
    if (validationError) {
      setEmailError(validationError);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave({ id: subscriber?.id, name, email, external_id: externalId, tags: selectedTags, notes });
    } catch (error) {
        console.error("Failed to save subscriber:", error);
        alert(`Error: Could not save subscriber. Please check the console for details or if the email is already in use.`);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Modal title={subscriber ? 'Edit Subscriber' : 'Add Subscriber'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
            <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
            <input 
                type="email" 
                id="email" 
                value={email} 
                onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                }} 
                required 
                aria-invalid={!!emailError}
                aria-describedby="email-error"
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${emailError ? 'border-red-500 ring-red-300' : 'border-gray-300'}`} 
            />
            {emailError && <p id="email-error" className="mt-1 text-sm text-red-600">{emailError}</p>}
          </div>
           <div>
            <label htmlFor="external_id" className="block text-sm font-medium text-gray-700">External ID (Optional)</label>
            <input type="text" id="external_id" value={externalId} onChange={(e) => setExternalId(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
          </div>
           <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Tags</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {allTags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleTagToggle(tag.id)}
                  className={`px-3 py-1 text-sm rounded-full ${selectedTags.includes(tag.id) ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
          <button type="submit" disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const SubscriberHistoryModal: React.FC<{
    subscriber: AppSubscriber;
    campaigns: Campaign[];
    onClose: () => void;
}> = ({ subscriber, campaigns, onClose }) => {
    const sentCampaigns = campaigns.filter(c => c.status === 'Sent' && c.recipients.includes(subscriber.id));

    return (
        <Modal title={`Campaign History for ${subscriber.name}`} onClose={onClose}>
            {sentCampaigns.length > 0 ? (
                <ul className="space-y-3">
                    {sentCampaigns.map(c => (
                        <li key={c.id} className="p-3 bg-gray-50 rounded-md">
                            <p className="font-semibold text-gray-800">{c.subject}</p>
                            <p className="text-sm text-gray-500">Sent on {c.sent_at ? new Date(c.sent_at).toLocaleString() : 'N/A'}</p>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-600">This subscriber has not been sent any campaigns yet.</p>
            )}
        </Modal>
    );
};

const ImportExportModal: React.FC<{
  db: dbService.DB;
  activeDatabaseId: number;
  refreshData: () => Promise<void>;
  subscribers: AppSubscriber[];
  tags: Tag[];
  onClose: () => void;
}> = ({ db, activeDatabaseId, refreshData, subscribers, tags, onClose }) => {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{success: number, failed: number} | null>(null);

  const handleExport = () => {
    const headers = ['id', 'name', 'email', 'external_id', 'tags', 'notes'];
    const rows = subscribers.map(sub => {
      const tagNames = sub.tags.map(tagId => tags.find(t => t.id === tagId)?.name).filter(Boolean) as string[];
      return [
          sub.id,
          sub.name,
          sub.email,
          sub.external_id || '',
          JSON.stringify(tagNames),
          sub.notes || ''
      ];
    });
    
    const csvContent = dbService.generateCsvContent(headers, rows);
    dbService.downloadFile("subscribers_export.csv", csvContent, "text/csv;charset=utf-8,");
  };
  
  const handleDownloadTemplate = () => {
    const header = "id,name,email,external_id,tags,notes\n";
    dbService.downloadFile("subscribers_import_template.csv", header, "text/csv;charset=utf-8,");
  };


  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      try {
        const result = await dbService.importSubscribersFromCSV(db, activeDatabaseId, text);
        setImportResult(result);
        await refreshData();
      } catch (error: any) {
        alert(`Import failed: ${error.message}`);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Allow re-uploading the same file
  };


  return (
    <Modal title="Import & Export Subscribers" onClose={onClose}>
      <div className="space-y-6">
        <div>
          <h4 className="font-semibold mb-2">Export Subscribers</h4>
          <p className="text-sm text-gray-600 mb-3">Download a CSV file of all your current subscribers. This file can be edited and re-imported.</p>
          <button onClick={handleExport} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700">
            {ICONS.download}
            <span className="ml-2">Export All as CSV</span>
          </button>
        </div>
        <hr/>
        <div>
          <h4 className="font-semibold mb-2">Import Subscribers</h4>
          <p className="text-sm text-gray-600 mb-3">
            Upload a CSV file to add or update subscribers. The file must contain an 'email' column.
            The 'email' column is used to identify existing subscribers for updates.
            The 'tags' column must be a JSON-formatted array of strings, e.g., <code className="text-xs bg-gray-200 p-1 rounded">["VIP", "New Customer"]</code>.
            The 'notes' column can contain multi-line text. New tags are created automatically.
          </p>
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
          {importResult && (
            <div className="mt-4 p-3 rounded-md bg-gray-100 text-sm">
              <p className="font-semibold">Import Complete</p>
              <p className="text-green-700">{importResult.success} subscribers successfully imported or updated.</p>
              <p className="text-red-700">{importResult.failed} rows failed (e.g., missing email or malformed).</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

const BulkActionBar: React.FC<{
    count: number;
    onEditTags: () => void;
    onDelete: () => void;
    onClear: () => void;
}> = ({ count, onEditTags, onDelete, onClear }) => (
    <div className="fixed bottom-5 right-5 z-40 bg-white p-4 rounded-lg shadow-2xl flex items-center space-x-4 border border-gray-200 animate-fade-in-up">
        <span className="text-sm font-semibold text-gray-800">{count} subscriber(s) selected</span>
        <button onClick={onEditTags} className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Edit Tags</button>
        <button onClick={onDelete} className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700">Delete</button>
        <button onClick={onClear} className="text-gray-500 hover:text-gray-800 text-sm font-medium">Cancel</button>
    </div>
);

const BulkEditTagsModal: React.FC<{
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
        <Modal title={`Bulk Edit Tags for ${subscriberIds.length} Subscribers`} onClose={onClose}>
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
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                    {isSaving ? 'Saving...' : 'Apply Changes'}
                </button>
            </div>
        </Modal>
    );
};

export default Subscribers;
