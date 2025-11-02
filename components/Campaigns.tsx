import React, { useState } from 'react';
import { Campaign, Subscriber } from '../types';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import { ICONS } from '../constants';

interface CampaignsProps {
  campaigns: Campaign[];
  subscribers: Subscriber[];
  handleEdit: (id: number) => void;
  handleDelete: (id: number) => Promise<void>;
  handleClone: (id: number) => void;
}

const Campaigns: React.FC<CampaignsProps> = ({ campaigns, subscribers, handleEdit, handleDelete, handleClone }) => {
  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleDeleteClick = (campaign: Campaign) => {
      setDeletingCampaign(campaign);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCampaign) return;
    setIsDeleting(true);
    await handleDelete(deletingCampaign.id);
    setIsDeleting(false);
    setDeletingCampaign(null);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Campaigns</h1>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipients</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {campaigns.map(campaign => (
              <tr key={campaign.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{campaign.subject}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : 'Draft'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{campaign.status === 'Sent' ? campaign.recipient_count : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${campaign.status === 'Sent' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button onClick={() => setViewingCampaign(campaign)} className="text-indigo-600 hover:text-indigo-900 p-1" title="View">{ICONS.eye}</button>
                    {campaign.status === 'Sent' && (
                        <button onClick={() => handleClone(campaign.id)} className="text-purple-600 hover:text-purple-900 p-1" title="Clone to Draft">{ICONS.transfer}</button>
                    )}
                    {campaign.status === 'Draft' && (
                        <>
                         <button onClick={() => handleEdit(campaign.id)} className="text-blue-600 hover:text-blue-900 p-1" title="Edit">{ICONS.edit}</button>
                         <button onClick={() => handleDeleteClick(campaign)} className="text-red-600 hover:text-red-900 p-1" title="Delete">{ICONS.trash}</button>
                        </>
                    )}
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
                <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-500">No campaigns found.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
      {viewingCampaign && (
        <CampaignDetailModal campaign={viewingCampaign} subscribers={subscribers} onClose={() => setViewingCampaign(null)} />
      )}
      {deletingCampaign && (
        <ConfirmationModal
            isOpen={!!deletingCampaign}
            title="Delete Draft"
            message={`Are you sure you want to delete the draft "${deletingCampaign.subject}"? This action cannot be undone.`}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeletingCampaign(null)}
            confirmText="Delete"
            isConfirming={isDeleting}
        />
      )}
    </div>
  );
};


const CampaignDetailModal: React.FC<{
  campaign: Campaign;
  subscribers: Subscriber[];
  onClose: () => void;
}> = ({ campaign, subscribers, onClose }) => {

  const getRecipientDetails = () => {
    if (campaign.status !== 'Sent') {
      return [];
    }
    return campaign.recipients.map(id => subscribers.find(s => s.id === id)).filter((s): s is Subscriber => !!s);
  };
  
  const recipientDetails = getRecipientDetails();

  return (
    <Modal title="Campaign Details" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-gray-800">Subject:</h4>
          <p>{campaign.subject}</p>
        </div>
        <hr />
        <div>
          <h4 className="font-semibold text-gray-800 mb-2">Content Preview:</h4>
          <div className="border rounded-md p-4 max-h-60 overflow-y-auto bg-gray-50">
             <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: campaign.body || '<p>No content.</p>'}} />
          </div>
        </div>
        <hr />
        <div>
          <h4 className="font-semibold text-gray-800 mb-2">
            {campaign.status === 'Sent' ? `Recipients (${campaign.recipient_count})` : 'Target Audience (Draft)'}
          </h4>
          {campaign.status === 'Sent' ? (
             <ul className="text-sm list-disc list-inside max-h-40 overflow-y-auto">
                {recipientDetails.map(sub => (
                  <li key={sub.id}>{sub.name} ({sub.email})</li>
                ))}
            </ul>
          ) : (
             <p className="text-sm text-gray-600">
                This is a draft. It was targeted at subscribers with <strong>{campaign.target?.logic}</strong> of the selected tags.
             </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default Campaigns;