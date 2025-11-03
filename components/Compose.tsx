import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppSubscriber, Tag, Campaign, TagGroup } from '../types';
import { ICONS } from '../constants';
import { generateNewsletterContent } from '../services/geminiService';
import * as dbService from '../services/dbService';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import TemplateLibraryModal from './TemplateLibraryModal';
import RichTextEditor from './RichTextEditor';
import AudienceGroupBuilder from './AudienceGroupBuilder';
import ScheduleModal from './ScheduleModal';

// Custom hook for debouncing
function useDebounce(value: any, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

interface ComposeProps {
    subscribers: AppSubscriber[];
    tags: Tag[];
    addCampaign: (campaign: Omit<Campaign, 'id'>) => Promise<Campaign>;
    updateCampaign: (campaign: Campaign) => Promise<void>;
    onFinish: () => void;
    campaignToEdit?: Campaign;
    campaigns: Campaign[];
    onComposeNew: () => void;
}

const Compose: React.FC<ComposeProps> = ({ subscribers, tags, addCampaign, updateCampaign, onFinish, campaignToEdit, campaigns, onComposeNew }) => {
    const [campaign, setCampaign] = useState<Campaign | Omit<Campaign, 'id'>>(() => {
        let initialCampaign = campaignToEdit || {
            subject: '', body: '', sent_at: null, scheduled_at: null, recipient_count: 0, 
            status: 'Draft' as const, recipients: [], target: { groups: [], groupsLogic: 'AND' }
        };

        if (initialCampaign.status === 'Scheduled') {
            initialCampaign = { ...initialCampaign, status: 'Draft', scheduled_at: null };
        }

        let currentGroups = initialCampaign.target.groups || [];
        if (currentGroups.length === 0) {
            currentGroups = [{ id: `default-${Date.now()}`, tags: [], logic: 'ANY', atLeast: 1 }];
        }
        
        return { ...initialCampaign, target: { ...initialCampaign.target, groups: currentGroups, groupsLogic: initialCampaign.target.groupsLogic || 'AND' } };
    });
    
    const { subject, body, target } = campaign;
    const { groups: targetGroups, groupsLogic } = target;

    const [recipientCount, setRecipientCount] = useState(0);
    const [isSending, setIsSending] = useState(false);
    const [sendProgress, setSendProgress] = useState(0);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');

    const [subjectError, setSubjectError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    
    const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
    const subjectInputContainerRef = useRef<HTMLDivElement>(null);

    const [isConfirmingSend, setIsConfirmingSend] = useState(false);
    const [isConfirmingTestSend, setIsConfirmingTestSend] = useState(false);
    const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    const draftCampaigns = useMemo(() => campaigns.filter(c => c.status === 'Draft'), [campaigns]);
    const filteredSubjects = draftCampaigns.filter(c => c.subject.toLowerCase().includes(subject.toLowerCase()) && c.subject.toLowerCase() !== subject.toLowerCase());

    const debouncedCampaign = useDebounce(campaign, 2000);
    const isFirstRender = useRef(true);
    const saveStatusRef = useRef(saveStatus);
    saveStatusRef.current = saveStatus;

    useEffect(() => {
        setRecipientCount(dbService.getRecipientIds(target, subscribers).length);
    }, [target, subscribers]);
    
    useEffect(() => {
        if (isFirstRender.current || campaign.status !== 'Draft') {
            isFirstRender.current = false;
            return;
        }
        if (saveStatus === 'unsaved' && saveStatusRef.current !== 'saving') {
            setSaveStatus('saving');
            const handleAutoSave = async () => {
                if ('id' in debouncedCampaign && debouncedCampaign.id) {
                    await updateCampaign(debouncedCampaign as Campaign);
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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (subjectInputContainerRef.current && !subjectInputContainerRef.current.contains(event.target as Node)) {
                setIsSubjectDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        setSubjectError(subject.trim() ? '' : 'Subject is required.');
    }, [subject]);

    const updateCampaignField = (field: keyof Campaign | 'target', value: any) => {
        setSaveStatus('unsaved');
        if (field === 'target') setCampaign(prev => ({ ...prev, target: { ...prev.target, ...value } }));
        else setCampaign(prev => ({ ...prev, [field]: value }));
    };

    const addGroup = () => {
        setSaveStatus('unsaved');
        const newGroup: TagGroup = { id: `new-${Date.now()}`, tags: [], logic: 'ANY', atLeast: 1 };
        updateCampaignField('target', { groups: [...targetGroups, newGroup] });
    };
    
    const removeGroup = (groupId: string) => {
        setSaveStatus('unsaved');
        let newGroups = targetGroups.filter(g => g.id !== groupId);
        if (newGroups.length === 0) newGroups.push({ id: `default-${Date.now()}`, tags: [], logic: 'ANY', atLeast: 1 });
        updateCampaignField('target', { groups: newGroups });
    };
    
    const updateGroup = (groupId: string, newGroupData: Partial<Omit<TagGroup, 'id'>>) => {
        setSaveStatus('unsaved');
        const newGroups = targetGroups.map(g => (g.id === groupId ? { ...g, ...newGroupData } : g));
        updateCampaignField('target', { groups: newGroups });
    };

    const handleSubjectSelect = (selectedSubject: string) => {
        const draft = draftCampaigns.find(c => c.subject === selectedSubject);
        if (draft) setCampaign(draft);
        else updateCampaignField('subject', selectedSubject);
        setIsSubjectDropdownOpen(false);
    };
    
    const handleGenerateWithAi = async () => {
        if (!aiPrompt) return;
        setIsAiLoading(true);
        setAiError('');
        try {
            const content = await generateNewsletterContent(aiPrompt);
            updateCampaignField('body', campaign.body + content);
        } catch (error: any) { setAiError(error.message); } 
        finally { setIsAiLoading(false); }
    };

    const handleSelectTemplate = (templateHtml: string) => {
        if (body.trim() && !window.confirm('This will replace your current content. Are you sure?')) return;
        updateCampaignField('body', templateHtml.trim());
        setIsTemplateLibraryOpen(false);
    };
    
    const handleSend = () => {
        if (subjectError) return alert(subjectError);
        if (recipientCount === 0) return alert('This campaign has 0 recipients. Please adjust your audience filters.');
        setIsConfirmingSend(true);
    };
    
    const confirmSend = async () => {
        setIsConfirmingSend(false);
        setIsSending(true);
        setSendProgress(0);
    
        const recipientIds = dbService.getRecipientIds(target, subscribers);
        const sendingCampaignData = {
          ...campaign, status: 'Sending' as const, recipient_count: recipientIds.length,
          recipients: [], sent_at: new Date().toISOString(),
        };
    
        let currentCampaign: Campaign;
        if ('id' in campaign && campaign.id) {
            await updateCampaign(sendingCampaignData as Campaign);
            currentCampaign = sendingCampaignData as Campaign;
        } else {
            currentCampaign = await addCampaign(sendingCampaignData);
        }
        setCampaign(currentCampaign);
    
        await new Promise(resolve => setTimeout(resolve, 2000));
        setSendProgress(100);
    
        const finalCampaignData: Campaign = { ...currentCampaign, status: 'Sent', recipients: recipientIds };
        await updateCampaign(finalCampaignData);
    
        setIsSending(false);
        onFinish();
    };

    const handleSchedule = async (isoDate: string) => {
        if (subjectError) return alert(subjectError);
        if (recipientCount === 0) return alert('This campaign has 0 recipients.');
        
        const scheduledCampaignData = {
            ...campaign, status: 'Scheduled' as const, scheduled_at: isoDate,
            recipient_count: 0, recipients: [],
        };

        if ('id' in campaign && campaign.id) {
            await updateCampaign(scheduledCampaignData as Campaign);
        } else {
            await addCampaign(scheduledCampaignData);
        }
        setIsScheduleModalOpen(false);
        onFinish();
    };

    const handleSaveDraft = async () => {
        setSaveStatus('saving');
        if ('id' in campaign && campaign.id) await updateCampaign(campaign as Campaign);
        else setCampaign(await addCampaign(campaign));
        setSaveStatus('saved');
    }

    const handleSendTest = () => {
        const testTag = tags.find(t => t.name === 'AppTest');
        if (!testTag) {
            return alert("'AppTest' tag not found. Please create it in the Tags section.");
        }
        const testRecipients = subscribers.filter(s => s.tags.includes(testTag.id));
        if (testRecipients.length === 0) {
            return alert("No subscribers found with the 'AppTest' tag. Please assign it to at least one subscriber.");
        }
        setIsConfirmingTestSend(true);
    };

    const confirmSendTest = async () => {
        setIsConfirmingTestSend(false);
        setIsSending(true);
        setSendProgress(0);

        const testTag = tags.find(t => t.name === 'AppTest')!;
        const testRecipientIds = subscribers.filter(s => s.tags.includes(testTag.id)).map(s => s.id);

        const testCampaignDraft: Omit<Campaign, 'id'> = {
            ...campaign,
            subject: `[TEST] ${campaign.subject || 'Untitled Campaign'}`,
            status: 'Sent',
            sent_at: new Date().toISOString(),
            scheduled_at: null,
            recipient_count: testRecipientIds.length,
            recipients: testRecipientIds,
        };

        await addCampaign(testCampaignDraft);
        await new Promise(resolve => setTimeout(resolve, 500));
        setSendProgress(100);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setIsSending(false);
        setSendProgress(0);
        alert(`Test campaign sent to ${testRecipientIds.length} recipient(s). Your original draft is untouched.`);
    };

    const SaveStatusIndicator = () => {
        let text = 'All changes saved', color = 'text-green-600';
        if (saveStatus === 'saving') { text = 'Saving...'; color = 'text-yellow-600'; }
        if (saveStatus === 'unsaved') { text = 'Unsaved changes'; color = 'text-gray-500'; }
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
                             <button onClick={onComposeNew} className="text-sm text-indigo-600 hover:underline font-semibold">+ Start New Draft</button>
                        </div>
                    )}
                    <div className="space-y-4">
                        <div ref={subjectInputContainerRef} className="relative">
                            <input type="text" placeholder="Subject" value={subject} onChange={e => updateCampaignField('subject', e.target.value)} onFocus={() => setIsSubjectDropdownOpen(true)} className={`w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 ${subjectError ? 'border-red-500 ring-red-300' : 'border-gray-300 focus:ring-indigo-500'}`} />
                            {isSubjectDropdownOpen && filteredSubjects.length > 0 && (
                                <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">
                                    <li className="px-4 pt-2 pb-1 text-xs font-semibold text-gray-500">Load existing draft...</li>
                                    {filteredSubjects.map(c => <li key={c.id} className="px-4 py-2 text-sm text-gray-700 hover:bg-indigo-100 cursor-pointer" onClick={() => handleSubjectSelect(c.subject)}>{c.subject}</li>)}
                                </ul>
                            )}
                            {subjectError && <p className="text-xs text-red-600 mt-1">{subjectError}</p>}
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-gray-700">Newsletter Body</label>
                                <button onClick={() => setIsTemplateLibraryOpen(true)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Choose Template</button>
                            </div>
                            <RichTextEditor value={body} onChange={val => updateCampaignField('body', val)} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">AI Assistant (Gemini)</h2>
                    <div className="flex gap-2">
                        <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g., 'a section about our new product'" className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={handleGenerateWithAi} disabled={isAiLoading} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700 disabled:bg-purple-300">{isAiLoading ? 'Generating...' : <>{ICONS.sparkles}<span className="ml-2">Generate</span></> }</button>
                    </div>
                    {aiError && <p className="text-sm text-red-600 mt-2">{aiError}</p>}
                </div>
            </div>
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-lg font-semibold text-gray-800 mb-2">Audience Builder</h2>
                    <div className="flex items-center space-x-2 text-sm text-gray-500 mb-4 bg-gray-100 p-2 rounded-md">
                        <span>Subscribers must match</span>
                        <div className="bg-white rounded-md shadow-sm">
                            <button onClick={() => updateCampaignField('target', { groupsLogic: 'AND' })} className={`px-3 py-1 text-xs rounded-l-md ${groupsLogic === 'AND' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}>ALL</button>
                            <button onClick={() => updateCampaignField('target', { groupsLogic: 'OR' })} className={`px-3 py-1 text-xs rounded-r-md ${groupsLogic === 'OR' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}>ANY</button>
                        </div>
                         <span>of the groups below:</span>
                    </div>

                    <div className="space-y-4">
                        {targetGroups.map((group, index) => <AudienceGroupBuilder key={group.id} group={group} groupIndex={index} allTags={tags} onUpdate={(newGroupData) => updateGroup(group.id, newGroupData)} onRemove={() => removeGroup(group.id)} canBeRemoved={targetGroups.length > 1} />)}
                    </div>
                    <button onClick={addGroup} className="mt-4 w-full text-sm text-indigo-600 border-2 border-dashed border-indigo-300 rounded-lg py-2 hover:bg-indigo-50 transition-colors">+ Add Audience Group</button>
                    <div className="mt-6 text-center bg-indigo-50 p-4 rounded-lg">
                        <p className="text-sm text-indigo-700">This will send to approximately</p>
                        <p className="text-3xl font-bold text-indigo-800">{recipientCount}</p>
                        <p className="text-sm text-indigo-700">subscribers</p>
                    </div>
                </div>
                 <div className="bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Actions</h2>
                     <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setIsScheduleModalOpen(true)} disabled={isSending || !!subjectError} className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-300">Schedule</button>
                            <button onClick={handleSend} disabled={isSending || !!subjectError} className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 disabled:bg-green-300">{isSending ? `Sending...` : 'Send Now'}</button>
                        </div>
                        {isSending && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div className="bg-green-600 h-2.5 rounded-full transition-all duration-100 ease-linear" style={{ width: `${sendProgress}%` }}></div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={handleSaveDraft} className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 border border-transparent rounded-md hover:bg-gray-300">Save Draft</button>
                            <button onClick={handleSendTest} disabled={isSending || !!subjectError} className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 border border-transparent rounded-md hover:bg-indigo-200 disabled:bg-indigo-50">Send Test</button>
                        </div>
                     </div>
                </div>
            </div>
            {isConfirmingSend && <ConfirmationModal isOpen={isConfirmingSend} title="Confirm Campaign Send" message={`This will send the campaign "${subject}" to ${recipientCount} subscribers immediately. This action cannot be undone.`} onConfirm={confirmSend} onCancel={() => setIsConfirmingSend(false)} confirmText="Send Now" isConfirming={isSending} />}
            {isConfirmingTestSend && <ConfirmationModal isOpen={isConfirmingTestSend} title="Confirm Test Send" message={`This will send a test email to all subscribers with the 'AppTest' tag. The current draft will not be changed.`} onConfirm={confirmSendTest} onCancel={() => setIsConfirmingTestSend(false)} confirmText="Send Test" isConfirming={isSending} />}
            {isTemplateLibraryOpen && <TemplateLibraryModal onClose={() => setIsTemplateLibraryOpen(false)} onSelect={handleSelectTemplate} />}
            {isScheduleModalOpen && <ScheduleModal onClose={() => setIsScheduleModalOpen(false)} onSchedule={handleSchedule} />}
        </div>
    );
};

export default Compose;