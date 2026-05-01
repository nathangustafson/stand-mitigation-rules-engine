import { useEffect, useMemo, useState } from 'react'
import {
  Add as AddIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
  createObservation,
  listObservationFields,
  updateObservation,
  type Observation,
  type ObservationField,
  type ObservationFieldChild,
  type ObservationFieldType,
} from '../api/client'
import JsonEditor from './manage/JsonEditor'

type Mode = 'create' | 'edit'

interface Props {
  propertyId: number
  mode?: Mode
  /** When mode is 'edit', the observation being edited (its raw .values is the
   *  baseline). When mode is 'create' and `previousValues` is supplied, the
   *  form preloads from those — typically the latest observation's
   *  effective_values — so the user starts from the most recently known state
   *  and only records what they changed. */
  observation?: Observation | null
  previousValues?: Record<string, unknown> | null
  onCancel: () => void
  onSubmitted: (observation: Observation) => void
}

type ScalarValue = string | number | boolean
type RowValues = Record<string, ScalarValue>
type FieldState = ScalarValue | RowValues[]
type FormState = Record<string, FieldState>

type EntryMode = 'form' | 'json'

const DEFAULT_GROUP = 'Other'

export default function ObservationCaptureForm({
  propertyId,
  mode = 'create',
  observation,
  previousValues,
  onCancel,
  onSubmitted,
}: Props) {
  const [fields, setFields] = useState<ObservationField[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({})
  // The values dict the form was loaded with — submit only sends fields that
  // differ from this baseline (sparse "record only what changed" semantics).
  const [baseline, setBaseline] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [entry, setEntry] = useState<EntryMode>('form')
  const [jsonValid, setJsonValid] = useState(true)
  // Observation date (locally-formatted ISO without timezone, suitable for
  // <input type="datetime-local">). Empty in CREATE mode means "use server
  // time"; populated in EDIT mode from the existing observation.
  const [capturedAt, setCapturedAt] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    listObservationFields()
      .then((data) => {
        if (cancelled) return
        setFields(data)
        const seedSource =
          mode === 'edit' && observation
            ? observation.values
            : previousValues ?? {}
        setBaseline(seedSource)
        setForm(prefillFormState(data, seedSource))
        // Default the captured_at field: existing observation's value when
        // editing, today's local datetime when creating.
        if (mode === 'edit' && observation) {
          setCapturedAt(toLocalInputValue(observation.captured_at))
        } else {
          setCapturedAt(toLocalInputValue(new Date().toISOString()))
        }
      })
      .catch((e) => {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [mode, observation, previousValues])

  const groups = useMemo(() => (fields ? groupFields(fields) : []), [fields])

  const setField = (key: string, value: FieldState) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // Compute the values dict the form currently represents.
  const currentValues: Record<string, unknown> = useMemo(
    () => (fields ? buildPayload(fields, form) : {}),
    [fields, form],
  )

  // For CREATE mode, payload is the diff vs baseline. For EDIT mode, payload
  // replaces values entirely (existing semantics).
  const payload: Record<string, unknown> = useMemo(() => {
    if (mode === 'edit') return currentValues
    return diff(baseline, currentValues)
  }, [mode, currentValues, baseline])

  const hasChanges = Object.keys(payload).length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fields) return
    if (!hasChanges) {
      setSubmitError('No changes to record.')
      return
    }
    if (entry === 'json' && !jsonValid) {
      setSubmitError('Fix the JSON before saving.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Convert datetime-local string back to ISO. Browser produces
      // "YYYY-MM-DDTHH:MM" — backend's Pydantic accepts that as a naive
      // datetime, which is what we want (UTC at the model level).
      const capturedIso = capturedAt ? `${capturedAt}:00` : undefined
      const result =
        mode === 'edit' && observation
          ? await updateObservation(propertyId, observation.id, payload, capturedIso)
          : await createObservation(propertyId, payload, capturedIso)
      onSubmitted(result)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (!fields && !loadError) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  const baselineNote =
    mode === 'create' && Object.keys(baseline).length > 0
      ? 'Preloaded from the latest observation. Only fields you change will be recorded.'
      : null

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* pt: 1 prevents shrunk-label TextFields (e.g. the Observation date
          field below) from clipping against the DialogTitle's bottom edge —
          MUI's DialogContent has paddingTop: 0 when it follows a DialogTitle. */}
      <Stack spacing={2} sx={{ pt: 1 }}>
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {baselineNote && <Alert severity="info">{baselineNote}</Alert>}
        {submitError && <Alert severity="error">{submitError}</Alert>}

        <TextField
          fullWidth
          type="datetime-local"
          label="Observation date"
          value={capturedAt}
          onChange={(e) => setCapturedAt(e.target.value)}
          helperText={
            mode === 'edit'
              ? "When the data reflects. Editing this updates the observation's anchor in time."
              : 'Defaults to now. Backdate or future-date as needed.'
          }
          InputLabelProps={{ shrink: true }}
        />

        <Tabs
          value={entry}
          onChange={(_, v: EntryMode) => setEntry(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="form" label="Form" />
          <Tab value="json" label="JSON" />
        </Tabs>

        {entry === 'form' &&
          groups.map((group, idx) => (
            <Box key={group.label}>
              {idx > 0 && <Divider sx={{ my: 1 }} />}
              <Typography variant="overline" color="text.secondary">
                {group.label}
              </Typography>
              <Stack spacing={2} sx={{ mt: 1 }}>
                {group.fields.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={form[field.key]}
                    onChange={(v) => setField(field.key, v)}
                  />
                ))}
              </Stack>
            </Box>
          ))}

        {entry === 'json' && fields && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Edit the full values dict directly. Switching back to the form
              picks these values up.
            </Typography>
            <JsonEditor
              label="Values"
              value={currentValues}
              onChange={(next, valid) => {
                setJsonValid(valid)
                if (valid && next && typeof next === 'object' && !Array.isArray(next)) {
                  setForm(prefillFormState(fields, next as Record<string, unknown>))
                }
              }}
              helperText='Shape: { "field_key": value, ... } matching registry keys.'
              rows={10}
            />
          </Box>
        )}

        {mode === 'create' && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {hasChanges
                ? `Will record ${Object.keys(payload).length} changed field${
                    Object.keys(payload).length === 1 ? '' : 's'
                  }: ${Object.keys(payload).join(', ')}`
                : 'No changes vs. the previous observation.'}
            </Typography>
          </Box>
        )}

        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || !fields || !hasChanges || (entry === 'json' && !jsonValid)}
          >
            {submitting
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : 'Save observation'}
          </Button>
        </Stack>
      </Stack>
    </form>
  )
}

interface FieldInputProps {
  field: ObservationField
  value: FieldState | undefined
  onChange: (value: FieldState) => void
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  if (field.type === 'list_of_object') {
    const rows = (Array.isArray(value) ? value : []) as RowValues[]
    const children = field.item_schema?.fields ?? []
    const addRow = () => onChange([...rows, emptyRow(children)])
    const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx))
    const updateRow = (idx: number, key: string, v: ScalarValue) =>
      onChange(rows.map((row, i) => (i === idx ? { ...row, [key]: v } : row)))

    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          {field.label}
        </Typography>
        <Stack spacing={1}>
          {rows.map((row, idx) => (
            <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  {children.map((child) => (
                    <ScalarInput
                      key={child.key}
                      label={child.label}
                      type={child.type}
                      allowedValues={child.allowed_values ?? undefined}
                      valueLabels={child.value_labels ?? undefined}
                      unit={child.unit ?? undefined}
                      value={row[child.key]}
                      onChange={(v) => updateRow(idx, child.key, v)}
                    />
                  ))}
                </Stack>
                <IconButton
                  aria-label="remove"
                  onClick={() => removeRow(idx)}
                  size="small"
                  sx={{ mt: 0.5 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Paper>
          ))}
          <Box>
            <Button startIcon={<AddIcon />} onClick={addRow} size="small">
              Add {field.label.toLowerCase()}
            </Button>
          </Box>
        </Stack>
      </Box>
    )
  }

  return (
    <ScalarInput
      label={field.label}
      type={field.type}
      allowedValues={field.allowed_values ?? undefined}
      valueLabels={field.value_labels ?? undefined}
      unit={field.unit ?? undefined}
      value={value as ScalarValue | undefined}
      onChange={onChange}
    />
  )
}

interface ScalarInputProps {
  label: string
  type: ObservationFieldType
  allowedValues?: string[]
  valueLabels?: Record<string, string>
  unit?: string
  value: ScalarValue | undefined
  onChange: (value: ScalarValue) => void
}

function ScalarInput({
  label,
  type,
  allowedValues,
  valueLabels,
  unit,
  value,
  onChange,
}: ScalarInputProps) {
  if (type === 'boolean') {
    const checked = value === true
    return (
      <FormControlLabel
        control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
        label={label}
      />
    )
  }

  if (type === 'enum') {
    const options = allowedValues ?? []
    const current = typeof value === 'string' ? value : ''
    return (
      <TextField
        select
        fullWidth
        label={label}
        value={current}
        onChange={(e) => onChange(e.target.value)}
      >
        <MenuItem value="">—</MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {valueLabels?.[opt] ?? opt}
          </MenuItem>
        ))}
      </TextField>
    )
  }

  if (type === 'number') {
    const current = value === undefined || value === '' ? '' : String(value)
    return (
      <TextField
        fullWidth
        type="number"
        label={label}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        InputProps={
          unit
            ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }
            : undefined
        }
      />
    )
  }

  const current = typeof value === 'string' ? value : ''
  return (
    <TextField
      fullWidth
      label={label}
      value={current}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function toLocalInputValue(iso: string): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" in local time.
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function initialFormState(fields: ObservationField[]): FormState {
  const state: FormState = {}
  for (const field of fields) {
    if (field.type === 'boolean') {
      state[field.key] = false
    } else if (field.type === 'list_of_object') {
      state[field.key] = []
    } else {
      state[field.key] = ''
    }
  }
  return state
}

function prefillFormState(
  fields: ObservationField[],
  saved: Record<string, unknown>,
): FormState {
  const state = initialFormState(fields)
  for (const field of fields) {
    if (!(field.key in saved)) continue
    const raw = saved[field.key]
    if (field.type === 'boolean') {
      state[field.key] = Boolean(raw)
    } else if (field.type === 'number') {
      state[field.key] = typeof raw === 'number' ? String(raw) : (raw as ScalarValue) ?? ''
    } else if (field.type === 'list_of_object') {
      state[field.key] = Array.isArray(raw) ? raw.map(toRowValues) : []
    } else {
      state[field.key] = (raw as ScalarValue) ?? ''
    }
  }
  return state
}

function toRowValues(item: unknown): RowValues {
  if (typeof item !== 'object' || item === null) return {}
  const out: RowValues = {}
  for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
    if (typeof v === 'number') {
      out[k] = String(v)
    } else if (typeof v === 'boolean' || typeof v === 'string') {
      out[k] = v
    }
  }
  return out
}

function emptyRow(children: ObservationFieldChild[]): RowValues {
  const row: RowValues = {}
  for (const child of children) {
    row[child.key] = child.type === 'boolean' ? false : ''
  }
  return row
}

interface FieldGroup {
  label: string
  fields: ObservationField[]
}

function groupFields(fields: ObservationField[]): FieldGroup[] {
  const order: string[] = []
  const buckets = new Map<string, ObservationField[]>()
  for (const field of fields) {
    const label = field.group_label ?? null
    const key = label ?? '__default__'
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(field)
  }
  return order.map((key) => ({
    label: key === '__default__' ? DEFAULT_GROUP : key,
    fields: buckets.get(key)!,
  }))
}

function buildPayload(
  fields: ObservationField[],
  form: FormState,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = form[field.key]
    if (field.type === 'boolean') {
      // Boolean form state always has a value (default false). Only include
      // the field if it differs from default — handled by diff() at the
      // submit boundary in CREATE mode. For EDIT mode this overrides values
      // with the user's explicit choice.
      out[field.key] = raw === true
      continue
    }
    if (field.type === 'number') {
      if (raw === '' || raw === undefined) continue
      const num = Number(raw)
      if (Number.isNaN(num)) continue
      out[field.key] = num
      continue
    }
    if (field.type === 'list_of_object') {
      const rows = Array.isArray(raw) ? (raw as RowValues[]) : []
      const children = field.item_schema?.fields ?? []
      const cleaned: Record<string, unknown>[] = []
      for (const row of rows) {
        const entry: Record<string, unknown> = {}
        for (const child of children) {
          const childValue = row[child.key]
          if (child.type === 'boolean') {
            entry[child.key] = childValue === true
            continue
          }
          if (child.type === 'number') {
            if (childValue === '' || childValue === undefined) continue
            const num = Number(childValue)
            if (Number.isNaN(num)) continue
            entry[child.key] = num
            continue
          }
          if (typeof childValue === 'string') {
            if (childValue === '') continue
            entry[child.key] = childValue
          }
        }
        cleaned.push(entry)
      }
      // Always include the array — empty arrays are meaningful for diffs
      // (e.g. "vegetation went from [tree] to []" is a real change).
      out[field.key] = cleaned
      continue
    }
    if (typeof raw === 'string') {
      if (raw === '') continue
      out[field.key] = raw
    }
  }
  return out
}

function diff(
  baseline: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)])
  for (const key of keys) {
    if (!sameValue(baseline[key], current[key])) {
      // Only include if current actually has a value (don't send fields the
      // user blanked out — keep semantics conservative for the POC).
      if (key in current) out[key] = current[key]
    }
  }
  return out
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b))
}

function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize)
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, canonicalize(val)]),
    )
  }
  return v
}
