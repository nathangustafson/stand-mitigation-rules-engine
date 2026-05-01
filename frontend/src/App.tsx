import { useState } from 'react'
import { Link as RouterLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material'
import HomePage from './pages/HomePage'
import PropertiesListPage from './pages/PropertiesListPage'
import PropertyDetailPage from './pages/PropertyDetailPage'
import FieldsManagePage from './pages/manage/FieldsManagePage'
import MitigationsListPage from './pages/manage/MitigationsListPage'
import RuleDetailPage from './pages/manage/RuleDetailPage'
import RulesListPage from './pages/manage/RulesListPage'
import { USER_TYPE_LABELS, type UserType } from './types'

export default function App() {
  const [userType, setUserType] = useState<UserType>('underwriter')

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      <AppBar position="static" elevation={0} color="primary">
        <Toolbar>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ color: 'inherit', textDecoration: 'none', flexGrow: 1 }}
          >
            Mitigation Rules Engine
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <RoleNavButton
              userType={userType}
              setUserType={setUserType}
              target="underwriter"
            />
            <RoleNavButton
              userType={userType}
              setUserType={setUserType}
              target="applied_sciences"
            />
          </Stack>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<HomePage userType={userType} />} />
          <Route path="/properties" element={<PropertiesListPage />} />
          <Route path="/properties/:id" element={<PropertyDetailPage />} />
          <Route path="/manage/rules" element={<RulesListPage userType={userType} />} />
          <Route path="/manage/rules/:id" element={<RuleDetailPage userType={userType} />} />
          <Route
            path="/manage/mitigations"
            element={<MitigationsListPage userType={userType} />}
          />
          <Route path="/manage/fields" element={<FieldsManagePage userType={userType} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </Box>
  )
}

interface RoleNavButtonProps {
  userType: UserType
  setUserType: (next: UserType) => void
  target: UserType
}

function RoleNavButton({ userType, setUserType, target }: RoleNavButtonProps) {
  const navigate = useNavigate()
  const active = userType === target
  return (
    <Button
      color="inherit"
      onClick={() => {
        if (!active) setUserType(target)
        navigate('/')
      }}
      sx={{
        fontWeight: active ? 700 : 400,
        borderBottom: '2px solid',
        borderColor: active ? 'common.white' : 'transparent',
        borderRadius: 0,
        pb: 0.5,
      }}
    >
      {USER_TYPE_LABELS[target]}
    </Button>
  )
}
