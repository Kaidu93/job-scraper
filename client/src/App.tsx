import JobList from './components/JobList'

function App() {
  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <span className="logo">Kicker<span className="logo-accent">tech</span></span>
          <div className="nav-right">
            <a href="https://www.linkedin.com/company/kickertech/jobs/" className="linkedin-icon" target="_blank" rel="noreferrer">in</a>
            <a href="https://kickertech.com/jobs/" className="btn-careers" target="_blank" rel="noreferrer">Careers</a>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <h1 className="page-title">Open Positions</h1>
        <p className="page-subtitle">If you did not find what you&apos;re looking for, keep an eye out!</p>
        <JobList />
      </main>
    </>
  )
}

export default App
