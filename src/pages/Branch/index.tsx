import { useAccess } from '../../layout/access';
import { ChainOverview } from '../Overview';
import { FmOverview } from '../Overview/Fm';

/**
 * Branch overview (/branch): the overview of the gym in scope (4 KPI tiles, This gym, its recommended actions,
 * crowd heatmap card, the gym comparison with this gym highlighted and the detail tabs scoped to the gym).
 * Opened at network scope the route switches to Hittin Gym (Men) first (RequireGym in App.tsx).
 * The Facility Manager sees his gym's operations page, the same as his top Overview.
 */
export default function BranchOverviewPage() {
  const { isFm } = useAccess();
  return isFm ? <FmOverview /> : <ChainOverview mode="branch" />;
}
