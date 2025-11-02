import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// Fix: Import AppSubscriber to correctly type subscribers with tags.
import { Subscriber, Tag, TagLogic, Campaign, AppSubscriber } from '../types';
import { ICONS } from '../constants';
import { generateNewsletterContent } from '../services/geminiService';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import PdfPreview from './PdfPreview';

// Custom hook for debouncing
function useDebounce(value: any, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

interface ComposeProps {
    subscribers: AppSubscriber[];
    tags: Tag[];
    addCampaign: (campaign: Omit<Campaign, 'id'>) => Promise<Campaign>;
    updateCampaign: (campaign: Campaign) => void;
    onFinish: () => void;
    campaignToEdit?: Campaign;
    campaigns: Campaign[]; // Pass all campaigns for subject line suggestions
    onComposeNew: () => void;
}

const Compose: React.FC<ComposeProps> = ({ subscribers, tags, addCampaign, updateCampaign, onFinish, campaignToEdit, campaigns, onComposeNew }) => {
    const [campaign, setCampaign] = useState<Campaign | Omit<Campaign, 'id'>>(() => 
        campaignToEdit || {
            subject: '', body: '', sent_at: null, recipient_count: 0, status: 'Draft', recipients: [],
            target: { tags: [], logic: 'ANY' }
        }
    );
    const { subject, body, target } = campaign;
    const { tags: selectedTags, logic: tagLogic } = target;

    const [recipientCount, setRecipientCount] = useState(0);
    const [isSending, setIsSending] = useState(false);
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');

    const [subjectError, setSubjectError] = useState('');
    const [htmlWarning, setHtmlWarning] = useState('');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    
    const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
    const subjectInputContainerRef = useRef<HTMLDivElement>(null);

    const [isConfirmingSend, setIsConfirmingSend] = useState(false);

    const draftCampaigns = useMemo(() => campaigns.filter(c => c.status === 'Draft'), [campaigns]);
    const filteredSubjects = draftCampaigns.filter(c => c.subject.toLowerCase().includes(subject.toLowerCase()) && c.subject.toLowerCase() !== subject.toLowerCase());


    const debouncedCampaign = useDebounce(campaign, 2000);
    const isFirstRender = useRef(true);

    const getRecipientIds = useCallback(() => {
        if (selectedTags.length === 0) {
            return subscribers.map(s => s.id);
        }
        return subscribers
            .filter(sub => {
                const subTags = new Set(sub.tags);
                if (tagLogic === 'ANY') return selectedTags.some(tagId => subTags.has(tagId));
                if (tagLogic === 'ALL') return selectedTags.every(tagId => subTags.has(tagId));
                if (tagLogic === 'NONE') return !selectedTags.some(tagId => subTags.has(tagId));
                return false;
            })
            .map(s => s.id);
    }, [subscribers, selectedTags, tagLogic]);

    useEffect(() => {
        setRecipientCount(getRecipientIds().length);
    }, [getRecipientIds]);
    
    // Auto-save logic
    useEffect(() => {
        if (isFirstRender.current || campaign.status !== 'Draft') {
            isFirstRender.current = false;
            return;
        }
        
        if (saveStatus === 'unsaved') {
            setSaveStatus('saving');
            const handleAutoSave = async () => {
                if ('id' in debouncedCampaign && debouncedCampaign.id) {
                    updateCampaign(debouncedCampaign as Campaign);
                } else {
                    const newCampaign = await addCampaign(debouncedCampaign as Omit<Campaign, 'id'>);
                    setCampaign(newCampaign); 
                }
                setSaveStatus('saved');
            };
            const timer = setTimeout(handleAutoSave, 500); 
            return () => clearTimeout(timer);
        }
    }, [debouncedCampaign, saveStatus, addCampaign, updateCampaign, campaign.status]);

    // Subject dropdown click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (subjectInputContainerRef.current && !subjectInputContainerRef.current.contains(event.target as Node)) {
                setIsSubjectDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);


    // Content validation
    useEffect(() => {
        setSubjectError(subject.trim() ? '' : 'Subject is required.');

        if (/<script/i.test(body)) {
            setHtmlWarning('Warning: Content contains <script> tags, which may be removed or cause issues.');
        } else {
            setHtmlWarning('');
        }
    }, [subject, body]);


    const updateCampaignField = (field: keyof Campaign | 'target', value: any) => {
        setSaveStatus('unsaved');
        if (field === 'target') {
            setCampaign(prev => ({ ...prev, target: { ...prev.target, ...value } }));
        } else {
            setCampaign(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSubjectSelect = (selectedSubject: string) => {
        const draft = draftCampaigns.find(c => c.subject === selectedSubject);
        if (draft) {
            setCampaign(draft); // Load the entire draft
        } else {
            updateCampaignField('subject', selectedSubject);
        }
        setIsSubjectDropdownOpen(false);
    };
    
    const handleGenerateWithAi = async () => {
        if (!aiPrompt) return;
        setIsAiLoading(true);
        setAiError('');
        try {
            const content = await generateNewsletterContent(aiPrompt);
            updateCampaignField('body', campaign.body + content);
        } catch (error: any) {
            setAiError(error.message);
        } finally {
            setIsAiLoading(false);
        }
    };
    
    const handleSend = () => {
        if (subjectError) {
            alert(subjectError);
            return;
        }
        if (recipientCount === 0) {
            alert('This campaign has 0 recipients. Please adjust your audience filters.');
            return;
        }
        setIsConfirmingSend(true);
    };
    
    const confirmSend = () => {
        setIsConfirmingSend(false);
        setIsSending(true);
        const recipientIds = getRecipientIds();

        // Simulate network delay for sending
        setTimeout(async () => {
            const finalCampaign: Omit<Campaign, 'id'> & {id?: number} = {
                ...campaign,
                sent_at: new Date().toISOString(),
                status: 'Sent',
                recipient_count: recipientIds.length,
                recipients: recipientIds,
            };
            
            if ('id' in campaign && campaign.id) {
                await updateCampaign(finalCampaign as Campaign);
            } else {
                await addCampaign(finalCampaign);
            }

            setIsSending(false);
            onFinish();
        }, 1500);
    }

    const handleSaveDraft = () => {
        setSaveStatus('saving');
        setTimeout(async () => {
            if ('id' in campaign && campaign.id) {
                await updateCampaign(campaign as Campaign);
            } else {
                const newCampaign = await addCampaign(campaign);
                setCampaign(newCampaign);
            }
            setSaveStatus('saved');
        }, 500)
    }

    const SaveStatusIndicator = () => {
        let text = 'All changes saved';
        let color = 'text-green-600';
        if (saveStatus === 'saving') {
            text = 'Saving...';
            color = 'text-yellow-600';
        }
        if (saveStatus === 'unsaved') {
            text = 'Unsaved changes';
            color = 'text-gray-500'
        }
        return <span className={`text-xs italic ${color}`}>{text}</span>;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-3xl font-bold text-gray-800">{campaignToEdit ? 'Edit Campaign' : 'Compose Newsletter'}</h1>
                        <SaveStatusIndicator />
                    </div>
                    {'id' in campaign && campaign.id && (
                        <div className="mb-4 flex justify-end">
                             <button onClick={onComposeNew} className="text-sm text-indigo-600 hover:underline font-semibold">
                                + Start New Draft
                             </button>
                        </div>
                    )}
                    <div className="space-y-4">
                        <div ref={subjectInputContainerRef} className="relative">
                            <input 
                                type="text" 
                                placeholder="Subject" 
                                value={subject} 
                                onChange={e => updateCampaignField('subject', e.target.value)}
                                onFocus={() => setIsSubjectDropdownOpen(true)}
                                className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 ${subjectError ? 'border-red-500 ring-red-300' : 'border-gray-300 focus:ring-indigo-500'}`} 
                            />
                            {isSubjectDropdownOpen && filteredSubjects.length > 0 && (
                                <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">
                                    <li className="px-4 pt-2 pb-1 text-xs font-semibold text-gray-500">Load existing draft...</li>
                                    {filteredSubjects.map(c => (
                                        <li 
                                            key={c.id} 
                                            className="px-4 py-2 text-sm text-gray-700 hover:bg-indigo-100 cursor-pointer"
                                            onClick={() => handleSubjectSelect(c.subject)}
                                        >
                                            {c.subject}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {subjectError && <p className="text-xs text-red-600 mt-1">{subjectError}</p>}
                        </div>
                        <div>
                            <textarea placeholder="Start writing your newsletter here (HTML is supported)..." value={body} onChange={e => updateCampaignField('body', e.target.value)} rows={20} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm" />
                            {htmlWarning && <p className="text-xs text-yellow-600 mt-1">{htmlWarning}</p>}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">AI Assistant (Gemini)</h2>
                    <div className="flex gap-2">
                        <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g., 'a section about our new product'" className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={handleGenerateWithAi} disabled={isAiLoading} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700 disabled:bg-purple-300">
                            {isAiLoading ? 'Generating...' : <>{ICONS.sparkles}<span className="ml-2">Generate</span></> }
                        </button>
                    </div>
                    {aiError && <p className="text-sm text-red-600 mt-2">{aiError}</p>}
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Audience</h2>
                     <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Filter by tags (or leave empty for all subscribers):</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {tags.map(tag => (
                                    <button key={tag.id} onClick={() => {
                                        const newTags = selectedTags.includes(tag.id) ? selectedTags.filter(id => id !== tag.id) : [...selectedTags, tag.id];
                                        updateCampaignField('target', { tags: newTags });
                                    }} className={`px-3 py-1 text-sm rounded-full ${selectedTags.includes(tag.id) ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{tag.name}</button>
                                ))}
                            </div>
                        </div>
                        {selectedTags.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Subscribers must have:</label>
                                <div className="flex flex-col space-y-1 mt-2">
                                    {(['ANY', 'ALL', 'NONE'] as TagLogic[]).map(logic => (
                                        <label key={logic} className="flex items-center">
                                            <input type="radio" name="tag-logic" value={logic} checked={tagLogic === logic} onChange={() => updateCampaignField('target', { logic })} className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                                            <span className="ml-2 text-sm text-gray-700">{logic === 'NONE' ? 'NONE of the selected tags' : `${logic} of the selected tags`}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="text-center bg-indigo-50 p-4 rounded-lg">
                            <p className="text-sm text-indigo-700">This will send to approximately</p>
                            <p className="text-3xl font-bold text-indigo-800">{recipientCount}</p>
                            <p className="text-sm text-indigo-700">subscribers</p>
                        </div>
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Actions</h2>
                    <div className="flex flex-col space-y-3">
                        <button onClick={handleSend} disabled={isSending || !!subjectError} className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 disabled:bg-green-300">
                            {isSending ? 'Sending...' : 'Send Campaign'}
                        </button>
                         <button onClick={handleSaveDraft} className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 border border-transparent rounded-md hover:bg-gray-300">
                            Save Draft
                        </button>
                        <button onClick={() => setShowPdfPreview(true)} className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 border border-transparent rounded-md hover:bg-indigo-200">
                           Test Run (PDF Preview)
                        </button>
                    </div>
                </div>
            </div>
             {showPdfPreview && (
                <Modal title="PDF Preview" onClose={() => setShowPdfPreview(false)}>
                    <PdfPreview subject={subject} body={body} recipientCount={recipientCount} tagLogic={tagLogic} />
                </Modal>
            )}
            {isConfirmingSend && (
                <ConfirmationModal
                    isOpen={isConfirmingSend}
                    title="Confirm Campaign Send"
                    message={`This will send the campaign "${subject}" to ${recipientCount} subscribers. This action cannot be undone.`}
                    onConfirm={confirmSend}
                    onCancel={() => setIsConfirmingSend(false)}
                    confirmText="Send"
                    isConfirming={isSending}
                />
            )}
        </div>
    );
};

export default Compose;