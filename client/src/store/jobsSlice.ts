import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

export interface Job {
  team: string
  location: string
  title: string
  detailsLink: string
  salaryMin: number
  salaryMax: number
  linkedInLink: string | null
}

interface JobsState {
  items: Job[] | null
  loading: boolean
  error: string | null
}

const initialState: JobsState = {
  items: null,
  loading: false,
  error: null,
}

export const fetchJobs = createAsyncThunk<Job[]>('jobs/fetch', async () => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch('/api/jobs', { signal: controller.signal })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(body.error ?? 'Request failed')
    }
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
})

const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message ?? 'Something went wrong'
      })
  },
})

export default jobsSlice.reducer
