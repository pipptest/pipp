import { redirect } from 'next/navigation';
import { currentClient } from '../../../lib/clientAuth';
import { loadLibrary } from '../../../lib/library';
import ClientNav from '../ClientNav';
import AssetLibrary from './AssetLibrary';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Assets · pipp' };

export default async function Assets() {
  const client = await currentClient();
  if (!client) redirect('/c/login');
  const library = await loadLibrary(client.id);

  return (
    <main>
      <ClientNav name={client.name} current="assets" />
      <div className="page-head">
        <div>
          <h1 className="title">Assets</h1>
          <p className="muted">Store photos and videos in folders and reuse them in any campaign.</p>
        </div>
      </div>
      <AssetLibrary folders={library.folders} assets={library.assets} />
    </main>
  );
}
