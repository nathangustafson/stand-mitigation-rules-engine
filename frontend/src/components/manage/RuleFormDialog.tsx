import { useEffect, useState } from 'react'
import {
  Add as AddIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import {
  listObservationFields,
  type MitigationInput,
  type MitigationTier,
  type ObservationField,
  type Rule,
  type RuleCreate,
  type RuleType,
  type Severity,
} from '../../api/client'
import ClauseEditor, { type Clause } from './ClauseEditor'
import JsonEditor from './JsonEditor'

type Mode = 'create' | 'edit'

interface Props {
  open: boolean
  mode: Mode
  initial?: Rule | null
  loading?: boolean
  error?: string | null
  onCancel: () => void
  onSubmit: (payload: RuleCreate) => void
}

const DEFAULT_BODIES: Record<RuleType, Record<string, unknown>> = {
  boolean: { type: 'boolean', field: '', must_equal: '' },
  logical: {
    type: 'logical',
    clause: { type: 'all_of', clauses: [] },
  },
  parameterized: {
    type: 'parameterized',
    base: 0,
    unit: 'ft',
    modifiers: [],
    compare_field: '',
    compare_op: '>=',
  },
}

const TYPE_HINTS: Record<RuleType, string> = {
  boolean: 'Shape: { "type": "boolean", "field": "<key>", "must_equal": <value> }',
  logical:
    'Shape: { "type": "logical", "clause": <clause> } where clause is one of equals/in/all_of/any_of (recursive).',
  parameterized:
    'Shape: { "type": "parameterized", "base": N, "unit": "ft", "modifiers": [...], "compare_field": "...", "compare_op": ">=" }',
}

export default function RuleFormDialog({
  open,
  mode,
  initial,
  loading,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<RuleType>('boolean')
  const [priority, setPriority] = useState(0)
  const [severity, setSeverity] = useState<Severity>('medium')
  const [enabled, setEnabled] = useState(true)
  const [body, setBody] = useState<Record<string, unknown>>(DEFAULT_BODIES.boolean)
  const [bodyValid, setBodyValid] = useState(true)
  const [mitigations, setMitigations] = useState<MitigationInput[]>([])
  const [touched, setTouched] = useState(false)
  const [fields, setFields] = useState<ObservationField[]>([])
  // Structured vs JSON view for the body. Defaults to structured for logical
  // (where the recursive editor adds the most value); JSON for the others
  // since their bodies are short and flat enough to read at a glance.
  const [bodyView, setBodyView] = useState<'structured' | 'json'>('json')

  useEffect(() => {
    if (!open) return
    setTouched(false)
    if (mode === 'edit' && initial) {
      setName(initial.name)
      setDescription(initial.description)
      setType(initial.type)
      setPriority(initial.priority)
      setSeverity(initial.severity)
      setEnabled(initial.enabled)
      setBody(initial.body)
      setBodyView(initial.type === 'logical' ? 'structured' : 'json')
      setMitigations(
        initial.mitigations.map((m) => ({
          tier: m.tier,
          name: m.name,
          description: m.description,
          effect: m.effect ?? null,
          sort_order: m.sort_order,
        })),
      )
    } else {
      setName('')
      setDescription('')
      setType('boolean')
      setPriority(0)
      setSeverity('medium')
      setEnabled(true)
      setBody(DEFAULT_BODIES.boolean)
      setBodyView('json')
      setMitigations([])
    }
    setBodyValid(true)
  }, [open, mode, initial])

  // Load the field registry once the dialog opens — needed by the structured
  // logical clause editor for field/value dropdowns.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    listObservationFields()
      .then((data) => {
        if (!cancelled) setFields(data)
      })
      .catch(() => {
        // The structured editor degrades gracefully (empty field list); JSON
        // tab still works. Don't block the dialog on registry fetch errors.
        if (!cancelled) setFields([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const handleTypeChange = (next: RuleType) => {
    setType(next)
    setBodyView(next === 'logical' ? 'structured' : 'json')
    if (mode === 'create') {
      setBody({ ...DEFAULT_BODIES[next] })
    }
  }

  const updateMitigation = (idx: number, patch: Partial<MitigationInput>) =>
    setMitigations((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)))

  const addMitigation = () =>
    setMitigations((prev) => [
      ...prev,
      { tier: 'full', name: '', description: '', sort_order: (prev.length + 1) * 10 },
    ])

  const removeMitigation = (idx: number) =>
    setMitigations((prev) => prev.filter((_, i) => i !== idx))

  const canSubmit =
    name.trim().length > 0 && bodyValid && mitigations.every((m) => m.name.trim().length > 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      body,
      enabled,
      priority,
      severity,
      mitigations: mitigations.map((m) => ({
        ...m,
        name: m.name.trim(),
        description: m.description.trim(),
        effect: m.effect?.trim() || null,
      })),
    })
  }

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{mode === 'create' ? 'New rule' : 'Edit rule'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={touched && name.trim().length === 0}
                  helperText={
                    touched && name.trim().length === 0 ? 'Name is required' : ' '
                  }
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  type="number"
                  label="Priority"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  helperText="Evaluation order"
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  select
                  fullWidth
                  label="Severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  helperText="Finding badness"
                >
                  <MenuItem value="low">low</MenuItem>
                  <MenuItem value="medium">medium</MenuItem>
                  <MenuItem value="high">high</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={2}>
                <FormControlLabel
                  control={
                    <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  }
                  label="Enabled"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  select
                  fullWidth
                  label="Rule type"
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as RuleType)}
                  disabled={mode === 'edit'}
                  helperText={mode === 'edit' ? 'Type is fixed once created' : ' '}
                >
                  <MenuItem value="boolean">boolean</MenuItem>
                  <MenuItem value="logical">logical</MenuItem>
                  <MenuItem value="parameterized">parameterized</MenuItem>
                </TextField>
              </Grid>
            </Grid>

            <Box>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle2">Body</Typography>
                {type === 'logical' && (
                  <Tabs
                    value={bodyView}
                    onChange={(_, v: 'structured' | 'json') => setBodyView(v)}
                    sx={{ minHeight: 32 }}
                  >
                    <Tab
                      value="structured"
                      label="Visual"
                      sx={{ minHeight: 32, py: 0.5 }}
                    />
                    <Tab value="json" label="JSON" sx={{ minHeight: 32, py: 0.5 }} />
                  </Tabs>
                )}
              </Stack>

              {type === 'logical' && bodyView === 'structured' ? (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Build the rule by composing clauses. Use AND / OR groups to nest conditions.
                  </Typography>
                  <ClauseEditor
                    clause={(body.clause as Clause) ?? { type: 'all_of', clauses: [] }}
                    fields={fields}
                    onChange={(next) =>
                      setBody({ ...body, type: 'logical', clause: next as unknown as Record<string, unknown> })
                    }
                  />
                </Box>
              ) : (
                <JsonEditor
                  label="body"
                  value={body}
                  onChange={(next, valid) => {
                    setBodyValid(valid)
                    if (valid && next && typeof next === 'object') {
                      setBody(next as Record<string, unknown>)
                    }
                  }}
                  helperText={TYPE_HINTS[type]}
                />
              )}
            </Box>

            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2">Mitigations</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={addMitigation}>
                  Add
                </Button>
              </Stack>
              {mitigations.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  None — click Add to attach a mitigation.
                </Typography>
              ) : (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  {mitigations.map((m, idx) => (
                    <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={2}>
                          <TextField
                            select
                            fullWidth
                            label="Tier"
                            value={m.tier}
                            onChange={(e) =>
                              updateMitigation(idx, {
                                tier: e.target.value as MitigationTier,
                              })
                            }
                          >
                            <MenuItem value="full">full</MenuItem>
                            <MenuItem value="bridge">bridge</MenuItem>
                          </TextField>
                        </Grid>
                        <Grid item xs={6} sm={5}>
                          <TextField
                            fullWidth
                            required
                            label="Name"
                            value={m.name}
                            onChange={(e) => updateMitigation(idx, { name: e.target.value })}
                          />
                        </Grid>
                        <Grid item xs={11} sm={4}>
                          <TextField
                            fullWidth
                            label="Effect (optional)"
                            value={m.effect ?? ''}
                            onChange={(e) =>
                              updateMitigation(idx, { effect: e.target.value })
                            }
                            placeholder="e.g. -20% to safe distance"
                          />
                        </Grid>
                        <Grid item xs={1} sx={{ display: 'flex', alignItems: 'center' }}>
                          <IconButton
                            aria-label="remove"
                            onClick={() => removeMitigation(idx)}
                            size="small"
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Grid>
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            multiline
                            minRows={1}
                            label="Description"
                            value={m.description}
                            onChange={(e) =>
                              updateMitigation(idx, { description: e.target.value })
                            }
                          />
                        </Grid>
                      </Grid>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading || !canSubmit}>
            {loading ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
