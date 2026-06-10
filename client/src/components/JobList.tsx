import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchJobs } from '../store/jobsSlice'

export default function JobList() {
  const dispatch = useDispatch<AppDispatch>()
  const { items, loading, error } = useSelector((state: RootState) => state.jobs)

  return (
    <div>
      <button className="btn-scrape" onClick={() => dispatch(fetchJobs())} disabled={loading}>
        {loading ? 'Scraping…' : 'Scrape Jobs'}
      </button>

      {loading && <p className="status-msg">Loading…</p>}

      {error && <p className="error-msg">Error: {error}</p>}

      {!loading && !error && items !== null && items.length === 0 && (
        <p className="status-msg">No job listings were found.</p>
      )}

      {!loading && !error && items !== null && items.length > 0 && (
        <div className="job-list">
          {items.map((job) => (
            <div key={job.detailsLink} className="job-card">
              <div className="job-left">
                <span className="job-team">{job.team}</span>
                <span className="job-location">{job.location}</span>
              </div>
              <div className="job-divider" />
              <div className="job-right">
                <a href={job.detailsLink} className="job-title" target="_blank" rel="noreferrer">
                  {job.title}
                </a>
                <div className="job-meta">
                  <span className="job-salary">{job.salaryMin} – {job.salaryMax} EUR</span>
                  {job.linkedInLink && (
                    <>
                      <span className="job-meta-sep">|</span>
                      <a href={job.linkedInLink} className="job-linkedin" target="_blank" rel="noreferrer">
                        Apply on LinkedIn
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
