import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Add as AddIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  createProperty,
  listProperties,
  seedDemoData,
  type Property,
  type PropertyCreate,
  type PropertyListItem,
} from '../api/client'
import Breadcrumbs from '../components/Breadcrumbs'
import PropertyFormDialog from '../components/PropertyFormDialog'

type DialogState = { kind: 'closed' } | { kind: 'create' }

export default function PropertiesListPage() {
  const [properties, setProperties] = useState<PropertyListItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedToast, setSeedToast] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await listProperties()
      setProperties(data)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSubmit = async (payload: PropertyCreate) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await createProperty(payload)
      setDialog({ kind: 'closed' })
      await refresh()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSeedDemo = async () => {
    setSeeding(true)
    setLoadError(null)
    try {
      const result = await seedDemoData()
      const created = result.properties_created
      const skipped = result.properties_skipped
      const obs = result.observations_created
      const parts: string[] = []
      if (created > 0) {
        parts.push(`${created} propert${created === 1 ? 'y' : 'ies'} added`)
        parts.push(`${obs} observation${obs === 1 ? '' : 's'}`)
      }
      if (skipped > 0) parts.push(`${skipped} already existed`)
      setSeedToast(parts.length > 0 ? parts.join(', ') : 'Nothing to seed')
      await refresh()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Breadcrumbs
        items={[
          { label: 'Underwriter', to: '/' },
          { label: 'Properties' },
        ]}
      />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Properties</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<AutoAwesomeIcon />}
            disabled={seeding}
            onClick={() => void handleSeedDemo()}
          >
            {seeding ? 'Seeding…' : 'Load demo data'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialog({ kind: 'create' })}
          >
            New property
          </Button>
        </Stack>
      </Stack>

      {loadError && <Alert severity="error">{loadError}</Alert>}

      {properties === null && !loadError && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {properties && properties.length === 0 && (
        <Card>
          <CardContent>
            <Typography variant="body1" sx={{ mb: 1 }}>
              No properties yet.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Click <strong>New property</strong> to add one manually, or{' '}
              <strong>Load demo data</strong> to populate three example properties
              (one high-risk, one compliant, one mixed) with observations ready
              to evaluate.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                disabled={seeding}
                onClick={() => void handleSeedDemo()}
              >
                {seeding ? 'Seeding…' : 'Load demo data'}
              </Button>
              <Button startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'create' })}>
                New property
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {properties && properties.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nickname</TableCell>
                <TableCell>Address</TableCell>
                <TableCell align="center">
                  <Tooltip title="Vulnerabilities triggered by the latest observation">
                    <span>Vulnerabilities</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="Outstanding mitigations from the latest evaluation: full + bridge">
                    <span>Outstanding mitigations</span>
                  </Tooltip>
                </TableCell>
                <TableCell>Latest observation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {properties.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/properties/${p.id}`}
                      underline="hover"
                      color="primary"
                      sx={{ fontWeight: 500 }}
                    >
                      {p.nickname || `Property #${p.id}`}
                    </Link>
                  </TableCell>
                  <TableCell>{addressOneLine(p)}</TableCell>
                  <TableCell align="center">
                    <VulnCell
                      observed={p.observation_count > 0}
                      count={p.outstanding_vulnerability_count}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <MitigationsCell
                      observed={p.observation_count > 0}
                      full={p.outstanding_full_mitigation_count}
                      bridge={p.outstanding_bridge_mitigation_count}
                    />
                  </TableCell>
                  <TableCell>
                    {p.latest_observation_at
                      ? new Date(p.latest_observation_at).toLocaleDateString()
                      : (
                        <Typography variant="body2" color="text.disabled">
                          —
                        </Typography>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <PropertyFormDialog
        open={dialog.kind === 'create'}
        mode="create"
        initial={null}
        loading={submitting}
        error={submitError}
        onCancel={() => setDialog({ kind: 'closed' })}
        onSubmit={handleSubmit}
      />

      <Snackbar
        open={Boolean(seedToast)}
        autoHideDuration={4000}
        onClose={() => setSeedToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSeedToast(null)} sx={{ width: '100%' }}>
          {seedToast}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

export function addressOneLine(p: Property): string {
  const line1 = [p.street, p.unit].filter(Boolean).join(' ')
  return `${line1}, ${p.city}, ${p.state} ${p.zip}`
}

function VulnCell({ observed, count }: { observed: boolean; count: number }) {
  if (!observed) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    )
  }
  return (
    <Chip
      size="small"
      label={count}
      color={count === 0 ? 'success' : count <= 2 ? 'warning' : 'error'}
      variant="outlined"
    />
  )
}

function MitigationsCell({
  observed,
  full,
  bridge,
}: {
  observed: boolean
  full: number
  bridge: number
}) {
  if (!observed) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    )
  }
  const total = full + bridge
  if (total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        none
      </Typography>
    )
  }
  return (
    <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
      <Tooltip title="Full mitigations">
        <Chip size="small" label={full} color="primary" variant="outlined" />
      </Tooltip>
      <Tooltip title="Bridge mitigations (count tracked per the brief)">
        <Chip size="small" label={`${bridge} bridge`} color="warning" variant="outlined" />
      </Tooltip>
    </Stack>
  )
}
