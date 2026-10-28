import { useEffect } from 'react';
import { useScope } from '../../layout/filters';
import { MapExplorer } from './MapExplorer';

/**
 * Kingdom map page (/map): the COO's first page after sign-in, in no menu (network level: no left menu). The
 * drill-down Kingdom, region, district and gym fact card, with the "All branches" row first above the regions
 * (opens the network Overview); picking a gym opens its Branch overview. The drill-down itself is MapExplorer.
 * The map is network level: opened while a gym is picked, the scope goes back to All branches.
 */
export { MapExplorer } from './MapExplorer';

export default function MapPage() {
  const { scope, setScope } = useScope();
  useEffect(() => {
    if (scope.level === 'club') setScope({ level: 'all' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="page mappage">
      <MapExplorer />
    </div>
  );
}
