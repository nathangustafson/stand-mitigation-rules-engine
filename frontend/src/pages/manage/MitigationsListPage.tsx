import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, Navigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import {
  listRules,
  type Mitigation,
  type MitigationTier,
  type Rule,
} from '../../api/client'
import Breadcrumbs from '../../components/Breadcrumbs'
import type { UserType } from '../../types'

interface FlattenedMitigation extends Mitigation {
  rule: Rule
}

interface Props {
  userType: UserType
}

type Filter = MitigationTier | 'all'

export default function MitigationsListPage({ userType }: Props) {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    listRules()
      .then((r) => {
        if (!cancelled) setRules(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const all = useMemo<FlattenedMitigation[]>(() => {
    if (!rules) return []
    const out: FlattenedMitigation[] = []
    for (const rule of rules) {
      for (const m of rule.mitigations) {
        out.push({ ...m, rule })
      }
    }
    // Stable sort: full first, then bridge; alphabetical within tier.
    return out.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === 'full' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [rules])

  const filtered = useMemo(
    () => (tierFilter === 'all' ? all : all.filter((m) => m.tier === tierFilter)),
    [all, tierFilter],
  )

  const counts = useMemo(() => {
    const full = all.filter((m) => m.tier === 'full').length
    const bridge = all.filter((m) => m.tier === 'bridge').length
    return { full, bridge, total: full + bridge }
  }, [all])

  if (userType !== 'applied_sciences') return <Navigate to="/" replace />

  return (
    <Stack spacing={2}>
      <Breadcrumbs
        items={[
          { label: 'Applied Sciences', to: '/' },
          { label: 'Mitigations' },
        ]}
      />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        spacing={1}
      >
        <Typography variant="h5">Mitigations</Typography>
        <ToggleButtonGroup
          size="small"
          value={tierFilter}
          exclusive
          onChange={(_, v: Filter | null) => v && setTierFilter(v)}
        >
          <ToggleButton value="all">All ({counts.total})</ToggleButton>
          <ToggleButton value="full">Full ({counts.full})</ToggleButton>
          <ToggleButton value="bridge">Bridge ({counts.bridge})</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Every mitigation attached to every rule. Bridge mitigations are subject to
        per-property limits per the brief — the count is tracked when an observation is
        evaluated. Click a rule name to edit a mitigation in context.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {rules === null && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {rules && filtered.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No mitigations match the current filter.
        </Typography>
      )}

      {rules && filtered.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={90}>Tier</TableCell>
                <TableCell>Mitigation</TableCell>
                <TableCell>Effect</TableCell>
                <TableCell>Rule</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={`${m.rule.id}-${m.id}`} hover>
                  <TableCell>
                    <Chip
                      size="small"
                      label={m.tier}
                      color={m.tier === 'full' ? 'primary' : 'warning'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {m.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {m.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color={m.effect ? 'text.primary' : 'text.disabled'}>
                      {m.effect ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/manage/rules/${m.rule.id}`}
                      underline="hover"
                      color="primary"
                    >
                      {m.rule.name}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  )
}
