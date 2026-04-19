import { useState } from 'react';
import CampaignList from './CampaignList.jsx';
import CampaignDetail from './CampaignDetail.jsx';

export default function CampaignDashboard({
  campaigns,
  updateLeadStatus,
  updateLeadNotes,
  bulkUpdateStatus,
  removeLeadsFromCampaign,
}) {
  const [openCampaignId, setOpenCampaignId] = useState(null);

  const openCampaign = openCampaignId
    ? campaigns.find((c) => c.id === openCampaignId)
    : null;

  if (openCampaign) {
    return (
      <CampaignDetail
        campaign={openCampaign}
        onBack={() => setOpenCampaignId(null)}
        updateLeadStatus={updateLeadStatus}
        updateLeadNotes={updateLeadNotes}
        bulkUpdateStatus={bulkUpdateStatus}
        removeLeadsFromCampaign={removeLeadsFromCampaign}
      />
    );
  }

  return <CampaignList campaigns={campaigns} onOpen={(id) => setOpenCampaignId(id)} />;
}
