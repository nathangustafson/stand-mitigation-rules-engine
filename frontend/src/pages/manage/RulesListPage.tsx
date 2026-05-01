import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom'
import { Add as AddIcon } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import {
  createRule,
  listRules,
  updateRule,
  type Rule,
  type RuleCreate,
  type RuleType,
  type Severity,
} from '../../api/client'
import Breadcrumbs from '../../components/Breadcrumbs'
import RuleFormDialog from '../../components/manage/RuleFormDialog'
import type { UserType } from '../../types'

type DialogState = { kind: 'closed' } | { kind: 'create' }

const TYPE_COLOR: Record<RuleType, 'default' | 'info' | 'warning'> = {
  boolean: 'default',
  logical: 'info',
  parameterized: 'warning',
}

const SEVERITY_COLOR: Record<Severity, 'info' | 'warning' | 'error'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
}

interface Props {
  userType: UserType
}

export default function RulesListPage({ userType }: Props) {
  const navigate = useNavigate()
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      setRules(await listRules())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (userType !== 'applied_sciences') {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (payload: RuleCreate) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await createRule(payload)
      setDialog({ kind: 'closed' })
      navigate(`/manage/rules/${created.id}`)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleEnabled = async (rule: Rule) => {
    try {
      await updateRule(rule.id, { enabled: !rule.enabled })
      await refresh()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Stack spacing={2}>
      <Breadcrumbs
        items={[
          { label: 'Applied Sciences', to: '/' },
          { label: 'Rules' },
        ]}
      />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Rules</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ kind: 'create' })}
        >
          New rule
        </Button>
      </Stack>

      {loadError && <Alert severity="error">{loadError}</Alert>}

      {rules === null && !loadError && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {rules && rules.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No rules yet. Click <strong>New rule</strong> to add one.
        </Typography>
      )}

      {rules && rules.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell align="right">Priority</TableCell>
                <TableCell align="center">Enabled</TableCell>
                <TableCell align="right">Mitigations</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/manage/rules/${r.id}`}
                      underline="hover"
                      color="primary"
                      sx={{ fontWeight: 500 }}
                    >
                      {r.name}
                    </Link>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {r.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={r.type} color={TYPE_COLOR[r.type]} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.severity}
                      color={SEVERITY_COLOR[r.severity]}
                    />
                  </TableCell>
                  <TableCell align="right">{r.priority}</TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={r.enabled}
                      onChange={() => void toggleEnabled(r)}
                    />
                  </TableCell>
                  <TableCell align="right">{r.mitigations.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <RuleFormDialog
        open={dialog.kind === 'create'}
        mode="create"
        initial={null}
        loading={submitting}
        error={submitError}
        onCancel={() => setDialog({ kind: 'closed' })}
        onSubmit={handleSubmit}
      />
    </Stack>
  )
}
