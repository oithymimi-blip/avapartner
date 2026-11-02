import React from 'react';

export default function Careers() {
  const jobs = [
    { title: "Senior Affiliate Manager", location: "London, UK", type: "Full-Time" },
    { title: "Digital Marketing Specialist", location: "Remote (EU)", type: "Full-Time" },
    { title: "Partnerships Executive (LatAm)", location: "Remote", type: "Full-Time" }
  ];

  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Join the Fexova Team</h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          We are always looking for driven, innovative individuals to help us shape the future of online financial marketing.
        </p>
      </div>

      <div className="bg-[#11161d] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl mb-12">
        <h2 className="text-3xl font-bold mb-6 text-brand">Why Work With Us?</h2>
        <div className="prose prose-invert max-w-none text-white/70 mb-8">
          <p>
            Working at Fexova means being part of a dynamic, fast-paced environment where your ideas are valued and your growth is prioritized. We offer competitive salaries, comprehensive health benefits, and an unbeatable corporate culture.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white/5 p-6 rounded-2xl">
            <h4 className="font-bold text-white mb-2">Global Impact</h4>
            <p className="text-sm text-white/50">Work on campaigns that reach millions of users across 150+ countries.</p>
          </div>
          <div className="bg-white/5 p-6 rounded-2xl">
            <h4 className="font-bold text-white mb-2">Continuous Learning</h4>
            <p className="text-sm text-white/50">Access to industry-leading training, conferences, and career advancement programs.</p>
          </div>
          <div className="bg-white/5 p-6 rounded-2xl">
            <h4 className="font-bold text-white mb-2">Flexible Work</h4>
            <p className="text-sm text-white/50">Hybrid and remote work models available for top-tier global talent.</p>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-bold mb-6">Open Positions</h3>
      <div className="space-y-4">
        {jobs.map((job, idx) => (
          <div key={idx} className="bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between hover:border-brand/40 transition-colors">
            <div>
              <h4 className="text-xl font-bold text-white mb-1">{job.title}</h4>
              <div className="flex items-center gap-4 text-sm text-white/50">
                <span className="flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> {job.location}</span>
                <span className="flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> {job.type}</span>
              </div>
            </div>
            <button className="mt-4 md:mt-0 px-6 py-2 bg-white/10 hover:bg-brand hover:text-black font-bold rounded-full transition-all text-sm">
              Apply Now
            </button>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center text-white/50 text-sm">
        Don't see a perfect fit? Send your resume to <a href="mailto:careers@fexova.com" className="text-brand hover:underline">careers@fexova.com</a> and we'll keep you in mind for future openings.
      </div>
    </div>
  );
}
