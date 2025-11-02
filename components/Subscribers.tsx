import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSubscriber, Tag, Campaign } from '../types';
import { ICONS } from '../constants';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import * as dbService from '../services/dbService';

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
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- Bulk Actions State ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<'addTags' | 'removeTags' | 'unsubscribe' | 'delete' | null>(null);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [justUpdatedIds, setJustUpdatedIds] = useState<Set<number>>(new Set());
  const masterCheckboxRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Effect to clear the visual feedback highlight after a delay
  useEffect(() => {
    if (justUpdatedIds.size > 0) {
        const timer = setTimeout(() => {
            setJustUpdatedIds(new Set());
        }, 2500); // Highlight for 2.5 seconds
        return () => clearTimeout(timer);
    }
  }, [justUpdatedIds]);

  const filteredSubscribers = subscribers.filter(s => 
    s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // --- Selection Logic ---
  const handleSelectOne = (id: number) => {
    setSelectedIds(prevSelectedIds => {
      const newSelection = new Set(prevSelectedIds);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return newSelection;
    });
  };
  
  const { isAllSelected, isSomeSelected } = useMemo(() => {
    if (filteredSubscribers.length === 0) {
        return { isAllSelected: false, isSomeSelected: false };
    }
    const visibleIds = filteredSubscribers.map(s => s.id);
    const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length;
    
    const allSelected = selectedVisibleCount === visibleIds.length;
    
    return {
        isAllSelected: allSelected,
        isSomeSelected: selectedVisibleCount > 0 && !allSelected,
    };
  }, [filteredSubscribers, selectedIds]);

  useEffect(() => {
    if (masterCheckboxRef.current) {
        masterCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    const visibleIds = new Set(filteredSubscribers.map(s => s.id));
    
    setSelectedIds(prevSelectedIds => {
        const newSelection = new Set(prevSelectedIds);
        if (isChecked) {
            // Add all visible IDs
            visibleIds.forEach(id => newSelection.add(id));
        } else {
            // Remove all visible IDs
            visibleIds.forEach(id => newSelection.delete(id));
        }
        return newSelection;
    });
  };


  const handleAdd = () => {
    setEditingSubscriber(null);
    setIsModalOpen(true);
  };

  const handleEdit = (subscriber: AppSubscriber) => {
    setEditingSubscriber(subscriber);
    setIsModalOpen(true);
  };
  
  const handleSetStatus = async (subscriberId: number, isSubscribed: boolean) => {
    await dbService.setSubscriberStatus(db, subscriberId, isSubscribed);
    await refreshData();
    setActiveDropdown(null);
  }

  const handleDeleteClick = (subscriber: AppSubscriber) => {
    setDeletingSubscriber(subscriber);
    setActiveDropdown(null);
  };
  
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    if (bulkAction === 'delete') {
      await dbService.bulkDeleteSubscribers(db, Array.from(selectedIds));
      await refreshData();
      setSelectedIds(new Set());
    } else if (deletingSubscriber) {
      await dbService.deleteSubscriber(db, deletingSubscriber.id);
      await refreshData();
    }
    setIsDeleting(false);
    setDeletingSubscriber(null);
    setBulkAction(null);
  };


  const handleSave = async (subscriberData: Omit<AppSubscriber, 'id' | 'subscribed_at' | 'unsubscribed_at'> & { id?: number }) => {
    if (subscriberData.id) {
      // Fetch the full subscriber object to preserve status
      const originalSub = subscribers.find(s => s.id === subscriberData.id);
      if (originalSub) {
        await dbService.updateSubscriber(db, { ...originalSub, ...subscriberData });
      }
    } else {
      await dbService.addSubscriber(db, activeDatabaseId, subscriberData);
    }
    await refreshData();
    setIsModalOpen(false);
  };
  
  const handleConfirmBulkUnsubscribe = async () => {
    setIsProcessingBulk(true);
    const changes = await dbService.bulkSetSubscriberStatus(db, Array.from(selectedIds), false);
    if (changes > 0) {
        await refreshData();
        setJustUpdatedIds(new Set(selectedIds));
    }
    setIsProcessingBulk(false);
    setBulkAction(null);
    setSelectedIds(new Set());
  }

  const handleConfirmBulkTags = async (tagIds: number[]) => {
    if (tagIds.length === 0) {
      setBulkAction(null);
      return;
    }
    setIsProcessingBulk(true);
    let changes = 0;
    const currentSelectedIds = new Set(selectedIds);

    if (bulkAction === 'addTags') {
      // Fix: Argument of type 'unknown[]' is not assignable to parameter of type 'number[]'.
      changes = await dbService.bulkAddTagsToSubscribers(db, Array.from(currentSelectedIds), tagIds);
    } else if (bulkAction === 'removeTags') {
      // Fix: Argument of type 'unknown[]' is not assignable to parameter of type 'number[]'.
      changes = await dbService.bulkRemoveTagsFromSubscribers(db, Array.from(currentSelectedIds), tagIds);
    }

    if (changes > 0) {
        await refreshData();
        setJustUpdatedIds(currentSelectedIds);
    }

    setIsProcessingBulk(false);
    setBulkAction(null);
    setSelectedIds(new Set());
  }
  
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
       
      {selectedIds.size > 0 && (
          <GroupActionBar
            count={selectedIds.size}
            onAddTags={() => setBulkAction('addTags')}
            onRemoveTags={() => setBulkAction('removeTags')}
            onUnsubscribe={() => setBulkAction('unsubscribe')}
            onDelete={() => setBulkAction('delete')}
            onClear={() => setSelectedIds(new Set())}
          />
      )}

       <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input 
                  type="checkbox"
                  ref={masterCheckboxRef}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" 
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subscribed On</th>
              <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSubscribers.map(subscriber => (
              <tr key={subscriber.id} className={`transition-colors duration-500 ease-in-out hover:bg-gray-50 
                ${justUpdatedIds.has(subscriber.id) ? 'bg-green-100' : (selectedIds.has(subscriber.id) ? 'bg-indigo-50' : 'bg-white')}
              `}>
                 <td className="px-4 py-4">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" 
                    checked={selectedIds.has(subscriber.id)}
                    onChange={() => handleSelectOne(subscriber.id)}
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
                 <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {subscriber.unsubscribed_at ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Unsubscribed</span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Subscribed</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(subscriber.subscribed_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                   <div className="relative inline-block text-left" ref={dropdownRef}>
                      <button onClick={() => setActiveDropdown(activeDropdown === subscriber.id ? null : subscriber.id)} className="p-2 text-gray-500 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                      </button>
                      {activeDropdown === subscriber.id && (
                        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                          <div className="py-1" role="menu" aria-orientation="vertical">
                            <button onClick={() => { setHistorySubscriber(subscriber); setActiveDropdown(null); }} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">{ICONS.history}<span className="ml-3">View History</span></button>
                            <div className="relative group">
                                <button onClick={() => handleEdit(subscriber)} disabled={!!subscriber.unsubscribed_at} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" role="menuitem">{ICONS.edit}<span className="ml-3">Edit Details</span></button>
                                {!!subscriber.unsubscribed_at && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 text-xs text-white bg-gray-700 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">Re-subscribe to edit</div>}
                            </div>
                            {subscriber.unsubscribed_at ? (
                                <button onClick={() => handleSetStatus(subscriber.id, true)} className="w-full text-left flex items-center px-4 py-2 text-sm text-green-700 hover:bg-gray-100" role="menuitem">{ICONS.resubscribe}<span className="ml-3">Re-subscribe</span></button>
                            ) : (
                                <button onClick={() => handleSetStatus(subscriber.id, false)} className="w-full text-left flex items-center px-4 py-2 text-sm text-red-700 hover:bg-gray-100" role="menuitem">{ICONS.unsubscribe}<span className="ml-3">Unsubscribe</span></button>
                            )}
                            <div className="border-t my-1"></div>
                            <button onClick={() => handleDeleteClick(subscriber)} className="w-full text-left flex items-center px-4 py-2 text-sm text-red-700 hover:bg-gray-100" role="menuitem">{ICONS.trash}<span className="ml-3">Delete Permanently</span></button>
                          </div>
                        </div>
                      )}
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <SubscriberModal
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
       { (bulkAction === 'addTags' || bulkAction === 'removeTags') && (
        <BulkTagsModal
          mode={bulkAction}
          allTags={tags}
          onClose={() => setBulkAction(null)}
          onConfirm={handleConfirmBulkTags}
          isProcessing={isProcessingBulk}
        />
      )}
      <ConfirmationModal
        isOpen={!!deletingSubscriber || bulkAction === 'delete' || bulkAction === 'unsubscribe'}
        title={
          bulkAction === 'delete' ? `Delete ${selectedIds.size} Subscribers` :
          bulkAction === 'unsubscribe' ? `Unsubscribe ${selectedIds.size} Subscribers` :
          'Delete Subscriber'
        }
        message={
          bulkAction === 'delete' ? `Are you sure you want to permanently delete ${selectedIds.size} selected subscribers? This action cannot be undone.` :
          bulkAction === 'unsubscribe' ? `Are you sure you want to unsubscribe ${selectedIds.size} selected subscribers?` :
          `Are you sure you want to permanently delete ${deletingSubscriber?.name} (${deletingSubscriber?.email})? This action cannot be undone.`
        }
        onConfirm={bulkAction === 'unsubscribe' ? handleConfirmBulkUnsubscribe : handleConfirmDelete}
        onCancel={() => { setDeletingSubscriber(null); setBulkAction(null); }}
        confirmText={
            bulkAction === 'delete' ? 'Delete' : bulkAction === 'unsubscribe' ? 'Unsubscribe' : 'Delete'
        }
        isConfirming={isDeleting || isProcessingBulk}
      />
    </div>
  );
};

const GroupActionBar: React.FC<{
  count: number;
  onAddTags: () => void;
  onRemoveTags: () => void;
  onUnsubscribe: () => void;
  onDelete: () => void;
  onClear: () => void;
}> = ({ count, onAddTags, onRemoveTags, onUnsubscribe, onDelete, onClear }) => {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between mb-4 animate-fade-in">
      <span className="font-semibold text-indigo-800">{count} subscriber{count > 1 ? 's' : ''} selected</span>
      <div className="flex items-center space-x-2">
        <button onClick={onAddTags} className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">{ICONS.addTags}<span className="ml-2">Add Tags</span></button>
        <button onClick={onRemoveTags} className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">{ICONS.removeTags}<span className="ml-2">Remove Tags</span></button>
        <button onClick={onUnsubscribe} className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-yellow-800 bg-yellow-100 border border-yellow-200 rounded-md hover:bg-yellow-200">{ICONS.unsubscribe}<span className="ml-2">Unsubscribe</span></button>
        <button onClick={onDelete} className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 border border-red-200 rounded-md hover:bg-red-200">{ICONS.trash}<span className="ml-2">Delete</span></button>
        <button onClick={onClear} title="Clear selection" className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
};

const BulkTagsModal: React.FC<{
  mode: 'addTags' | 'removeTags';
  allTags: Tag[];
  onClose: () => void;
  onConfirm: (tagIds: number[]) => void;
  isProcessing: boolean;
}> = ({ mode, allTags, onClose, onConfirm, isProcessing }) => {
    const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());

    const handleToggle = (tagId: number) => {
        const newSelection = new Set(selectedTagIds);
        if (newSelection.has(tagId)) {
            newSelection.delete(tagId);
        } else {
            newSelection.add(tagId);
        }
        setSelectedTagIds(newSelection);
    };

    const title = mode === 'addTags' ? 'Add Tags to Selection' : 'Remove Tags from Selection';
    const confirmText = mode === 'addTags' ? 'Add Tags' : 'Remove Tags';

    return (
        <Modal title={title} onClose={onClose}>
            <div>
                <p className="text-sm text-gray-600 mb-4">Select the tags you want to {mode === 'addTags' ? 'add' : 'remove'}.</p>
                <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1">
                    {allTags.map(tag => (
                        <label key={tag.id} className="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 cursor-pointer">
                            <input type="checkbox" checked={selectedTagIds.has(tag.id)} onChange={() => handleToggle(tag.id)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                            <span className="text-sm text-gray-800">{tag.name}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={onClose} disabled={isProcessing} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => onConfirm(Array.from(selectedTagIds))} disabled={isProcessing || selectedTagIds.size === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                    {isProcessing ? 'Processing...' : confirmText}
                </button>
            </div>
        </Modal>
    );
};

const SubscriberModal: React.FC<{
  subscriber: AppSubscriber | null;
  allTags: Tag[];
  onClose: () => void;
  onSave: (data: Omit<AppSubscriber, 'subscribed_at' | 'unsubscribed_at'>) => void;
}> = ({ subscriber, allTags, onClose, onSave }) => {
  const [name, setName] = useState(subscriber?.name || '');
  const [email, setEmail] = useState(subscriber?.email || '');
  const [externalId, setExternalId] = useState(subscriber?.external_id || '');
  const [selectedTags, setSelectedTags] = useState<number[]>(subscriber?.tags || []);

  const handleTagToggle = (tagId: number) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: subscriber?.id, name, email, external_id: externalId, tags: selectedTags });
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
            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
          </div>
           <div>
            <label htmlFor="external_id" className="block text-sm font-medium text-gray-700">External ID (Optional)</label>
            <input type="text" id="external_id" value={externalId} onChange={(e) => setExternalId(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
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
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Save</button>
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

  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const escapeCsvField = (field: any): string => {
    const str = String(field ?? '');
    // If the string contains a comma, a double quote, or a newline, enclose it in double quotes.
    if (/[",\r\n]/.test(str)) {
        // Escape any existing double quotes by doubling them.
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExport = () => {
    const headers = ['id', 'name', 'email', 'external_id', 'tags', 'unsubscribed_at'];
    const csvRows = [headers.join(',')]; // Header row

    subscribers.forEach(sub => {
      const tagNames = sub.tags.map(tagId => tags.find(t => t.id === tagId)?.name).filter(Boolean) as string[];
      const row = [
          sub.id,
          sub.name,
          sub.email,
          sub.external_id || '',
          JSON.stringify(tagNames),
          sub.unsubscribed_at || ''
      ];
      csvRows.push(row.map(escapeCsvField).join(','));
    });
    
    downloadFile("subscribers_export.csv", csvRows.join('\n'), "text/csv;charset=utf-8,");
  };
  
  const handleDownloadTemplate = () => {
    const header = "id,name,email,external_id,tags,unsubscribed_at\n";
    downloadFile("subscribers_import_template.csv", header, "text/csv;charset=utf-8,");
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
            The 'unsubscribed_at' column should contain a valid date string if the user is unsubscribed.
            New tags are created automatically.
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


export default Subscribers;