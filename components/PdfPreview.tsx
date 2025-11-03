import React from 'react';
import { TagGroup } from '../types';

interface PdfPreviewProps {
  subject: string;
  body: string;
  recipientCount: number;
  targetGroups: TagGroup[];
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ subject, body, recipientCount, targetGroups }) => {
  const describeTarget = () => {
    if (!targetGroups || targetGroups.length === 0 || (targetGroups.length === 1 && targetGroups[0].tags.length === 0)) {
        return "All subscribers";
    }
    if (targetGroups.length === 1) {
        const group = targetGroups[0];
        return `Subscribers with ${group.logic} of ${group.tags.length} selected tags.`
    }
    return `Subscribers matching all ${targetGroups.length} defined rule groups.`
  }

  return (
    <div className="bg-gray-100 p-6 rounded-md">
      <div className="bg-white p-8 shadow-lg max-w-4xl mx-auto">
        <h2 className="text-xl font-bold border-b pb-2 mb-4">Test Run Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div><span className="font-semibold">Campaign Subject:</span> {subject}</div>
          <div><span className="font-semibold">Estimated Recipients:</span> {recipientCount}</div>
          <div><span className="font-semibold">Audience:</span> {describeTarget()}</div>
          <div><span className="font-semibold">Generated On:</span> {new Date().toLocaleString()}</div>
        </div>
        
        <h2 className="text-xl font-bold border-b pb-2 mb-4">Newsletter Content Preview</h2>
        <div 
          className="prose prose-lg max-w-none" 
          dangerouslySetInnerHTML={{ __html: body || '<p>No content yet.</p>' }}
        />
      </div>
    </div>
  );
};

export default PdfPreview;