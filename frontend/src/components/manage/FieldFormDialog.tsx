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
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  type ObservationField,
  type ObservationFieldChild,
  type ObservationFieldCreate,
  type ObservationFieldType,
} from '../../api/client'
import JsonEditor from './JsonEditor'

type Mode = 'create' | 'edit'

interface Props {
  open: boolean
  mode: Mode
  initial?: ObservationField | null
  loading?: boolean
  error?: string | null
  onCancel: () => void
  onSubmit: (payload: ObservationFieldCreate) => void
}

const FIELD_TYPES: ObservationFieldType[] = [
  'enum',
  'number',
  'boolean',
  'string',
  'list_of_object',
]

export default function FieldFormDialog({
  open,
  mode,
  initial,
  loading,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<ObservationFieldType>('enum')
  const [unit, setUnit] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [allowedValues, setAllowedValues] = useState<string[]>([])
  // Display label per allowed enum code. Same length+order as allowedValues;
  // an empty string means "no friendly name; fall back to the underscored code".
  const [valueLabels, setValueLabels] = useState<string[]>([])
  const [itemSchema, setItemSchema] = useState<{ fields: ObservationFieldChild[] }>({
    fields: [],
  })
  const [itemSchemaValid, setItemSchemaValid] = useState(true)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setTouched(false)
    setItemSchemaValid(true)
    if (mode === 'edit' && initial) {
      setKey(initial.key)
      setLabel(initial.label)
      setType(initial.type)
      setUnit(initial.unit ?? '')
      setGroupLabel(initial.group_label ?? '')
      setSortOrder(initial.sort_order)
      const codes = initial.allowed_values ?? []
      setAllowedValues(codes)
      const labelMap = initial.value_labels ?? {}
      setValueLabels(codes.map((c) => labelMap[c] ?? ''))
      setItemSchema(initial.item_schema ?? { fields: [] })
    } else {
      setKey('')
      setLabel('')
      setType('enum')
      setUnit('')
      setGroupLabel('')
      setSortOrder(0)
      setAllowedValues([])
      setValueLabels([])
      setItemSchema({ fields: [] })
    }
  }, [open, mode, initial])

  const addAllowedValue = () => {
    setAllowedValues((prev) => [...prev, ''])
    setValueLabels((prev) => [...prev, ''])
  }
  const updateAllowedValue = (idx: number, value: string) =>
    setAllowedValues((prev) => prev.map((v, i) => (i === idx ? value : v)))
  const updateValueLabel = (idx: number, value: string) =>
    setValueLabels((prev) => prev.map((v, i) => (i === idx ? value : v)))
  const removeAllowedValue = (idx: number) => {
    setAllowedValues((prev) => prev.filter((_, i) => i !== idx))
    setValueLabels((prev) => prev.filter((_, i) => i !== idx))
  }

  const canSubmit =
    key.trim().length > 0 &&
    label.trim().length > 0 &&
    (type !== 'list_of_object' || itemSchemaValid)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return

    let resolvedValueLabels: Record<string, string> | null = null
    let resolvedAllowed: string[] | null = null
    if (type === 'enum') {
      resolvedAllowed = allowedValues.map((v) => v.trim()).filter(Boolean)
      const map: Record<string, string> = {}
      allowedValues.forEach((rawCode, idx) => {
        const code = rawCode.trim()
        const lab = (valueLabels[idx] ?? '').trim()
        if (code && lab) map[code] = lab
      })
      resolvedValueLabels = Object.keys(map).length > 0 ? map : null
    }

    const payload: ObservationFieldCreate = {
      key: key.trim(),
      label: label.trim(),
      type,
      unit: unit.trim() || null,
      group_label: groupLabel.trim() || null,
      sort_order: sortOrder,
      allowed_values: resolvedAllowed,
      value_labels: resolvedValueLabels,
      item_schema: type === 'list_of_object' ? itemSchema : null,
    }
    onSubmit(payload)
  }

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{mode === 'create' ? 'New field' : 'Edit field'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label="Key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={mode === 'edit'}
                  helperText={
                    mode === 'edit'
                      ? 'Key cannot be changed after creation'
                      : 'Snake_case identifier referenced by rules'
                  }
                  error={touched && key.trim().length === 0}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label="Label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  error={touched && label.trim().length === 0}
                  helperText={
                    touched && label.trim().length === 0 ? 'Label is required' : ' '
                  }
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  select
                  fullWidth
                  label="Type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ObservationFieldType)}
                >
                  {FIELD_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Group"
                  value={groupLabel}
                  onChange={(e) => setGroupLabel(e.target.value)}
                  helperText="UI section header"
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  type="number"
                  label="Order"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  label="Unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={!(type === 'number' || type === 'list_of_object')}
                />
              </Grid>
            </Grid>

            {type === 'enum' && (
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2">Allowed values</Typography>
                  <Button size="small" startIcon={<AddIcon />} onClick={addAllowedValue}>
                    Add
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Code is the snake_case identifier rules reference. Display name is what
                  underwriters see in dropdowns and violation messages — leave blank to fall
                  back to the code.
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {allowedValues.map((value, idx) => (
                    <Stack key={idx} direction="row" spacing={1}>
                      <TextField
                        size="small"
                        label="Code"
                        value={value}
                        onChange={(e) => updateAllowedValue(idx, e.target.value)}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        size="small"
                        label="Display name"
                        value={valueLabels[idx] ?? ''}
                        onChange={(e) => updateValueLabel(idx, e.target.value)}
                        sx={{ flex: 1.5 }}
                      />
                      <IconButton
                        aria-label="remove"
                        size="small"
                        onClick={() => removeAllowedValue(idx)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                  {allowedValues.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      No values yet. Add at least one.
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}

            {type === 'list_of_object' && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Item schema (JSON)
                </Typography>
                <JsonEditor
                  label="item_schema"
                  value={itemSchema}
                  onChange={(next, valid) => {
                    setItemSchemaValid(valid)
                    if (valid && next && typeof next === 'object') {
                      setItemSchema(next as { fields: ObservationFieldChild[] })
                    }
                  }}
                  helperText='Shape: { "fields": [{"key", "label", "type", "allowed_values?", "unit?"}, ...] }'
                  rows={6}
                />
              </Box>
            )}
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
