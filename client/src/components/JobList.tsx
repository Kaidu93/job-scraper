import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchJobs } from '../store/jobsSlice'

export default function JobList() {
  const dispatch = useDispatch<AppDispatch>()
  const { items, loading, error } = useSelector((state: RootState) => state.jobs)

  return (
    <div>
      <button onClick={() => dispatch(fetchJobs())} disabled={loading}>
        Scrape Jobs
      </button>

      {loading && <p>Loading...</p>}

      {error && <p>Error: {error}</p>}

      {!loading && !error && items === null && null}

      {!loading && !error && items !== null && items.length === 0 && (
        <p>No job listings were found.</p>
      )}

      {!loading && !error && items !== null && items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Location</th>
              <th>Title</th>
              <th>Details</th>
              <th>Min Salary (EUR)</th>
              <th>Max Salary (EUR)</th>
              <th>LinkedIn</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job, i) => (
              <tr key={i}>
                <td>{job.team}</td>
                <td>{job.location}</td>
                <td>{job.title}</td>
                <td><a href={job.detailsLink} target="_blank" rel="noreferrer">View</a></td>
                <td>{job.salaryMin}</td>
                <td>{job.salaryMax}</td>
                <td>
                  {job.linkedInLink
                    ? <a href={job.linkedInLink} target="_blank" rel="noreferrer">Apply</a>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
