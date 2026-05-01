import { useEffect, useMemo, useState } from 'react'
import { PlayArrow as PlayArrowIcon } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import {
  listObservations,
  listProperties,
  testRule,
  type Mitigation,
  type Observation,
  type Property,
  type RuleTestResult,
} from '../../api/client'
import JsonEditor from './JsonEditor'

interface ObservationRow {
  observation: Observation
  property: Property
  label: string
}

type Mode = 'pick' | 'custom'

interface Props {
  ruleId: number
}

const DEFAULT_CUSTOM_VALUES = {
  attic_vent_screen: 'none',
  roof_type: 'class_c',
  window_type: 'single',
  wildfire_risk_category: 'd',
  vegetation: [{ type: 'shrub', distance_to_window_ft: 5 }],
}

export default function RuleTestCard({ ruleId }: Props) {
  const [mode, setMode] = useState<Mode>('pick')
  const [rows, setRows] = useState<ObservationRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<number | ''>('')
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(DEFAULT_CUSTOM_VALUES)
  const [customValid, setCustomValid] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RuleTestResult | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const properties = await listProperties()
        const collected: ObservationRow[] = []
        for (const property of properties) {
          const obs = await listObservations(property.id)
          for (const o of obs) {
            collected.push({
              observation: o,
              property,
              label: `${property.nickname ?? `Property #${property.id}`} · ${new Date(
                o.captured_at,
              ).toLocaleDateString()}`,
            })
          }
        }
        if (cancelled) return
        // Newest first across all properties
        collected.sort(
          (a, b) =>
            new Date(b.observation.captured_at).getTime() -
            new Date(a.observation.captured_at).getTime(),
        )
        setRows(collected)
        if (collected.length > 0 && pickedId === '') {
          setPickedId(collected[0].observation.id)
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickedRow = useMemo(
    () => rows?.find((r) => r.observation.id === pickedId) ?? null,
    [rows, pickedId],
  )

  const handleRun = async () => {
    setRunning(true)
    setRunError(null)
    setResult(null)
    try {
      const values =
        mode === 'pick'
          ? (pickedRow?.observation.values ?? {})
          : customValues
      const r = await testRule(ruleId, values)
      setResult(r)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const canRun =
    !running &&
    ((mode === 'pick' && pickedRow !== null) || (mode === 'custom' && customValid))

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Test against observation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Run this rule (and only this rule) against an observation to see whether it
          fires. Useful for validating edits before saving.
        </Typography>

        <FormControl sx={{ mb: 2 }}>
          <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <FormControlLabel
              value="pick"
              control={<Radio size="small" />}
              label="Use a saved observation"
            />
            <FormControlLabel
              value="custom"
              control={<Radio size="small" />}
              label="Custom values"
            />
          </RadioGroup>
        </FormControl>

        {mode === 'pick' && (
          <Box sx={{ mb: 2 }}>
            {loadError && <Alert severity="error">{loadError}</Alert>}
            {!loadError && rows === null && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            )}
            {rows && rows.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No saved observations to pick from. Create one on the Properties side, or
                switch to Custom values.
              </Typography>
            )}
            {rows && rows.length > 0 && (
              <FormControl fullWidth size="small">
                <Select
                  value={pickedId}
                  onChange={(e) => setPickedId(Number(e.target.value))}
                >
                  {rows.map((r) => (
                    <MenuItem key={r.observation.id} value={r.observation.id}>
                      {r.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        )}

        {mode === 'custom' && (
          <Box sx={{ mb: 2 }}>
            <JsonEditor
              label="Observation values"
              value={customValues}
              onChange={(next, valid) => {
                setCustomValid(valid)
                if (valid && next && typeof next === 'object') {
                  setCustomValues(next as Record<string, unknown>)
                }
              }}
              helperText="Object shape: { field_key: value, ... }. Match the registry keys (roof_type, vegetation, etc.)."
              rows={6}
            />
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={() => void handleRun()}
            disabled={!canRun}
          >
            {running ? 'Testing…' : 'Test rule'}
          </Button>
        </Stack>

        {runError && <Alert severity="error">{runError}</Alert>}

        {result && <ResultBlock result={result} />}
      </CardContent>
    </Card>
  )
}

function ResultBlock({ result }: { result: RuleTestResult }) {
  return (
    <Stack spacing={1.5}>
      <Alert severity={result.holds ? 'success' : 'warning'}>
        {result.holds ? (
          <>
            <strong>Rule holds</strong> — observation satisfies this rule.
          </>
        ) : (
          <>
            <strong>Rule violates</strong>
            {result.detail ? ` — ${result.detail}` : ''}
          </>
        )}
      </Alert>
      {!result.holds && (
        <>
          <MitigationsList title="Full mitigations that would surface" items={result.full_mitigations} />
          <MitigationsList
            title={`Bridge mitigations (count: ${result.bridge_mitigations.length})`}
            items={result.bridge_mitigations}
          />
        </>
      )}
    </Stack>
  )
}

function MitigationsList({ title, items }: { title: string; items: Mitigation[] }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          None.
        </Typography>
      ) : (
        <List dense disablePadding>
          {items.map((m) => (
            <ListItem key={m.id} disableGutters>
              <ListItemText
                primary={
                  <Typography variant="body2" fontWeight={500}>
                    {m.name}
                  </Typography>
                }
                secondary={
                  <>
                    <Typography component="span" variant="body2" color="text.secondary">
                      {m.description}
                    </Typography>
                    {m.effect && (
                      <Typography
                        component="div"
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.25 }}
                      >
                        Effect: {m.effect}
                      </Typography>
                    )}
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}
