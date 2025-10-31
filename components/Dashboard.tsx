import React from 'react';
import { Subscriber, Campaign } from '../types';
import { ICONS } from '../constants';

interface DashboardProps {
  subscribers: Subscriber[];
  campaigns: Campaign[];
}

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="p-6 bg-white rounded-xl shadow-md flex items-center space-x-4">
    <div className="flex-shrink-0 p-3 bg-indigo-100 text-indigo-600 rounded-full">
      {icon}
    </div>
    <div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  </div>
);

const SubscriberGrowthChart: React.FC<{ subscribers: Subscriber[] }> = ({ subscribers }) => {
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
    
    const relevantSubscribers = subscribers.filter(s => new Date(s.subscribed_at) >= thirtyDaysAgo);

    const dataByDay = Array.from({ length: 30 }, (_, i) => {
        const date = new Date(new Date().setDate(today.getDate() - (29 - i)));
        const dateString = date.toISOString().split('T')[0];
        return { date: dateString, count: 0 };
    });

    relevantSubscribers.forEach(sub => {
        const subDate = new Date(sub.subscribed_at).toISOString().split('T')[0];
        const dayData = dataByDay.find(d => d.date === subDate);
        if (dayData) {
            dayData.count++;
        }
    });

    const maxCount = Math.max(...dataByDay.map(d => d.count), 1); // Avoid division by zero

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h3 className="font-semibold text-gray-800 mb-4">Subscriber Growth (Last 30 Days)</h3>
            <div className="flex h-48 items-end justify-between space-x-1">
                {dataByDay.map(({ date, count }) => (
                    <div key={date} className="relative flex-1 flex flex-col items-center justify-end group">
                        <span className="absolute -top-6 text-xs text-white bg-gray-700 px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                            {count} subs
                        </span>
                        <div
                            className="w-full bg-indigo-300 rounded-t-md hover:bg-indigo-500"
                            style={{ height: `${(count / maxCount) * 100}%` }}
                            title={`${date}: ${count} new subscribers`}
                        ></div>
                    </div>
                ))}
            </div>
             <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>30 days ago</span>
                <span>Today</span>
            </div>
        </div>
    );
};


const Dashboard: React.FC<DashboardProps> = ({ subscribers, campaigns }) => {
  const sentCampaigns = campaigns.filter(c => c.status === 'Sent');
  const draftCampaigns = campaigns.filter(c => c.status === 'Draft');

  const totalRecipients = sentCampaigns.reduce((acc, c) => acc + c.recipient_count, 0);
  const avgRecipients = sentCampaigns.length > 0 ? (totalRecipients / sentCampaigns.length).toFixed(1) : '0';

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
      <p className="mt-1 text-gray-600">Welcome back! Here's a summary of your newsletter platform.</p>

      <div className="grid grid-cols-1 gap-6 mt-8 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Subscribers" value={subscribers.length} icon={ICONS.subscribers} />
        <StatCard title="Campaigns Sent" value={sentCampaigns.length} icon={ICONS.campaigns} />
        <StatCard title="Drafts in Progress" value={draftCampaigns.length} icon={ICONS.edit} />
        <StatCard title="Avg. Recipients" value={avgRecipients} icon={ICONS.compose} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <div className="lg:col-span-2">
            <SubscriberGrowthChart subscribers={subscribers} />
          </div>
          <div className="bg-white rounded-xl shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Recent Campaigns</h2>
            </div>
            <div className="p-6">
              {sentCampaigns.slice(0, 3).map(campaign => (
                <div key={campaign.id} className="py-3 border-b last:border-0">
                  <p className="font-semibold text-gray-800 truncate">{campaign.subject}</p>
                  <p className="text-sm text-gray-500">Sent to {campaign.recipient_count} recipients</p>
                </div>
              ))}
              {sentCampaigns.length === 0 && <p className="text-gray-500">No campaigns sent yet.</p>}
            </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
