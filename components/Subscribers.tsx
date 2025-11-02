
import React, { useState } from 'react';
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
  
  const filteredSubscribers = subscribers.filter(s => 
    s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subscribed On</th>
              <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSubscribers.map(subscriber => (
              <tr key={subscriber.id} className="hover:bg-gray-50">
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
    </div>
  );
};

const SubscriberModal: React.FC<{
  subscriber: AppSubscriber | null;
  allTags: Tag[];
  onClose: () => void;
  onSave: (data: Omit<AppSubscriber, 'subscribed_at'>) => void;
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

  const handleExport = () => {
    let csvContent = "data:text/csv;charset=utf-8,name,email,external_id,tags\n";
    subscribers.forEach(sub => {
      const tagNames = sub.tags.map(tagId => tags.find(t => t.id === tagId)?.name || '').join(';');
      csvContent += `${sub.name},${sub.email},${sub.external_id || ''},"${tagNames}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "subscribers.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <p className="text-sm text-gray-600 mb-3">Download a CSV file of all your current subscribers, including their external IDs and tags.</p>
          <button onClick={handleExport} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700">
            {ICONS.download}
            <span className="ml-2">Export as CSV</span>
          </button>
        </div>
        <hr/>
        <div>
          <h4 className="font-semibold mb-2">Import Subscribers</h4>
          <p className="text-sm text-gray-600 mb-3">Upload a CSV file with columns: `name`, `email`, `external_id`, `tags`. `name` can be blank. Tags should be semicolon-separated (e.g., "VIP;New"). New tags will be created automatically.</p>
          <label className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm cursor-pointer ${importing ? 'bg-green-300' : 'bg-green-600 hover:bg-green-700'}`}>
            {ICONS.upload}
            <span className="ml-2">{importing ? 'Processing...' : 'Choose CSV File'}</span>
            <input type='file' className="hidden" accept=".csv" onChange={handleImport} disabled={importing} />
          </label>
          {importResult && (
            <div className="mt-4 p-3 rounded-md bg-gray-100 text-sm">
              <p className="font-semibold">Import Complete</p>
              <p className="text-green-700">{importResult.success} subscribers successfully imported or updated.</p>
              <p className="text-red-700">{importResult.failed} rows failed (e.g., missing email).</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};


export default Subscribers;