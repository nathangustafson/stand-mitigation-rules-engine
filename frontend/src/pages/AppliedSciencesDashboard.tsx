import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Add as AddIcon,
  ArrowForward as ArrowForwardIcon,
  Build as BuildIcon,
  Category as CategoryIcon,
  Rule as RuleIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import {
  listObservationFields,
  listRules,
  type ObservationField,
  type Rule,
  type RuleType,
} from '../api/client'

const TYPE_COLOR: Record<RuleType, 'default' | 'info' | 'warning'> = {
  boolean: 'default',
  logical: 'info',
  parameterized: 'warning',
}

export default function AppliedSciencesDashboard() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [fields, setFields] = useState<ObservationField[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [r, f] = await Promise.all([listRules(), listObservationFields()])
        if (cancelled) return
        setRules(r)
        setFields(f)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    if (!rules || !fields) return null
    const enabled = rules.filter((r) => r.enabled).length
    const totalMitigations = rules.reduce((acc, r) => acc + r.mitigations.length, 0)
    const activeFields = fields.filter((f) => !f.deprecated_at).length
    const deprecatedFields = fields.length - activeFields
    const byType: Record<RuleType, number> = { boolean: 0, logical: 0, parameterized: 0 }
    for (const r of rules) byType[r.type] += 1
    return { enabled, totalRules: rules.length, totalMitigations, activeFields, deprecatedFields, byType }
  }, [rules, fields])

  const recentRules = useMemo(() => {
    if (!rules) return null
    return [...rules]
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      )
      .slice(0, 5)
  }, [rules])

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Applied Sciences</Typography>
        <Typography variant="body1" color="text.secondary">
          Define and refine the underwriting rules and the observation fields they reference.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={2}>
        <StatCard
          label="Rules"
          value={stats ? stats.totalRules : '—'}
          subtitle={stats ? `${stats.enabled} enabled` : undefined}
          icon={<RuleIcon color="primary" />}
          to="/manage/rules"
          loading={!stats}
        />
        <StatCard
          label="Mitigations"
          value={stats ? stats.totalMitigations : '—'}
          subtitle="across all rules"
          icon={<BuildIcon color="primary" />}
          to="/manage/mitigations"
          loading={!stats}
        />
        <StatCard
          label="Observation fields"
          value={stats ? stats.activeFields : '—'}
          subtitle={
            stats && stats.deprecatedFields > 0
              ? `${stats.deprecatedFields} deprecated`
              : 'all active'
          }
          icon={<CategoryIcon color="primary" />}
          to="/manage/fields"
          loading={!stats}
        />
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography variant="h6">Recent rules</Typography>
                <Button
                  component={RouterLink}
                  to="/manage/rules"
                  endIcon={<ArrowForwardIcon />}
                  size="small"
                >
                  All rules
                </Button>
              </Stack>
              {recentRules === null && !error && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              {recentRules && recentRules.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No rules yet.
                </Typography>
              )}
              {recentRules && recentRules.length > 0 && (
                <List dense disablePadding>
                  {recentRules.map((r) => (
                    <ListItem key={r.id} disableGutters>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Link
                              component={RouterLink}
                              to={`/manage/rules/${r.id}`}
                              underline="hover"
                            >
                              <Typography variant="body2" fontWeight={500}>
                                {r.name}
                              </Typography>
                            </Link>
                            <Chip size="small" label={r.type} color={TYPE_COLOR[r.type]} />
                            {!r.enabled && (
                              <Chip size="small" label="disabled" variant="outlined" />
                            )}
                          </Stack>
                        }
                        secondary={
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.secondary"
                            noWrap
                          >
                            {r.mitigations.length} mitigation
                            {r.mitigations.length === 1 ? '' : 's'} · updated{' '}
                            {formatRelative(r.updated_at)}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Rules by type
                </Typography>
                {stats ? (
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {(Object.keys(stats.byType) as RuleType[]).map((t) => (
                      <Chip
                        key={t}
                        label={`${t}: ${stats.byType[t]}`}
                        color={TYPE_COLOR[t]}
                        variant="outlined"
                        sx={{ mb: 1 }}
                      />
                    ))}
                  </Stack>
                ) : (
                  <CircularProgress size={20} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Quick actions
                </Typography>
                <Stack spacing={1.5}>
                  <Button
                    component={RouterLink}
                    to="/manage/rules"
                    variant="contained"
                    startIcon={<AddIcon />}
                    fullWidth
                  >
                    Author a new rule
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/manage/rules"
                    variant="outlined"
                    fullWidth
                  >
                    Manage rules
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/manage/mitigations"
                    variant="outlined"
                    fullWidth
                  >
                    Browse mitigations
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/manage/fields"
                    variant="outlined"
                    fullWidth
                  >
                    Manage observation fields
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  )
}

interface StatCardProps {
  label: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  to?: string
  loading?: boolean
}

function StatCard({ label, value, subtitle, icon, to, loading }: StatCardProps) {
  const content = (
    <Card sx={{ height: '100%', cursor: to ? 'pointer' : 'default' }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          {icon}
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        {loading ? (
          <CircularProgress size={20} />
        ) : (
          <Typography variant="h4">{value}</Typography>
        )}
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
  return (
    <Grid item xs={12} sm={4}>
      {to ? (
        <Link component={RouterLink} to={to} underline="none" color="inherit">
          {content}
        </Link>
      ) : (
        content
      )}
    </Grid>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days <= 0) {
    const hours = Math.floor(ms / (1000 * 60 * 60))
    if (hours <= 0) return 'just now'
    return `${hours}h ago`
  }
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}
