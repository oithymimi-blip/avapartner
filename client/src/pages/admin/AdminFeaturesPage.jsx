import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAdminAuth } from '../../adminStore';

export default function AdminFeaturesPage() {
  const { token } = useAdminAuth();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeatures() {
      try {
        const res = await api(token).get('/api/features');
        setFeatures(res.data || []);
      } catch (err) {
        console.error('Failed to load features', err);
      } finally {
        setLoading(false);
      }
    }
    loadFeatures();
  }, [token]);

  const toggleFeature = async (key, currentActive) => {
    const newActive = currentActive === 1 ? 0 : 1;
    setFeatures(prev => prev.map(f => f.key === key ? { ...f, active: newActive } : f));
    try {
      await api(token).put(`/api/admin/features/${key}`, { active: newActive });
    } catch (err) {
      console.error('Failed to toggle feature', err);
      // Revert on error
      setFeatures(prev => prev.map(f => f.key === key ? { ...f, active: currentActive } : f));
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-500">Loading features...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Feature Toggles</h1>
          <p className="text-slate-500 text-sm mt-1">Enable or disable trading features globally for all users.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {features.length === 0 && (
            <div className="p-8 text-center text-slate-500">No features found.</div>
          )}
          {features.map((feature) => (
            <div key={feature.key} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{feature.label}</h3>
                <p className="text-sm text-slate-500 mt-1">Toggle the {feature.label} trading module on or off.</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFeature(feature.key, feature.active)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                  feature.active === 1 ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
                role="switch"
                aria-checked={feature.active === 1}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    feature.active === 1 ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
