import { Navigate } from 'react-router-dom'
import type { UserType } from '../types'
import AppliedSciencesDashboard from './AppliedSciencesDashboard'

interface Props {
  userType: UserType
}

export default function HomePage({ userType }: Props) {
  // Underwriter has no dashboard at "/" — they go straight to their list.
  // Applied Sciences keeps a dashboard since they have multiple destinations.
  if (userType === 'applied_sciences') return <AppliedSciencesDashboard />
  return <Navigate to="/properties" replace />
}
