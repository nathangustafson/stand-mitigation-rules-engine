import {
  Add as AddIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material'
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { ObservationField } from '../../api/client'

export type Clause = EqualsClause | InClause | AllOfClause | AnyOfClause

interface EqualsClause {
  type: 'equals'
  field: string
  value: unknown
}

interface InClause {
  type: 'in'
  field: string
  values: unknown[]
}

interface AllOfClause {
  type: 'all_of'
  clauses: Clause[]
}

interface AnyOfClause {
  type: 'any_of'
  clauses: Clause[]
}

const CLAUSE_TYPE_LABEL: Record<Clause['type'], string> = {
  equals: 'is exactly',
  in: 'is one of',
  all_of: 'all of (AND)',
  any_of: 'any of (OR)',
}

interface Props {
  clause: Clause
  fields: ObservationField[]
  onChange: (next: Clause) => void
  onRemove?: () => void
  depth?: number
}

export default function ClauseEditor({
  clause,
  fields,
  onChange,
  onRemove,
  depth = 0,
}: Props) {
  const isGroup = clause.type === 'all_of' || clause.type === 'any_of'

  const handleTypeChange = (next: Clause['type']) => {
    if (next === clause.type) return
    if (next === 'all_of' || next === 'any_of') {
      const existingChildren = isGroup ? (clause as AllOfClause | AnyOfClause).clauses : []
      onChange({ type: next, clauses: existingChildren })
      return
    }
    const existingField =
      clause.type === 'equals' || clause.type === 'in' ? clause.field : ''
    if (next === 'equals') {
      onChange({ type: 'equals', field: existingField, value: '' })
    } else {
      onChange({ type: 'in', field: existingField, values: [] })
    }
  }

  const updateChild = (idx: number, child: Clause) => {
    if (clause.type !== 'all_of' && clause.type !== 'any_of') return
    onChange({
      ...clause,
      clauses: clause.clauses.map((c, i) => (i === idx ? child : c)),
    })
  }

  const removeChild = (idx: number) => {
    if (clause.type !== 'all_of' && clause.type !== 'any_of') return
    onChange({ ...clause, clauses: clause.clauses.filter((_, i) => i !== idx) })
  }

  const addChild = () => {
    if (clause.type !== 'all_of' && clause.type !== 'any_of') return
    onChange({
      ...clause,
      clauses: [...clause.clauses, { type: 'equals', field: '', value: '' }],
    })
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        bgcolor: depth % 2 === 0 ? 'background.paper' : 'action.hover',
        borderLeft: 3,
        borderLeftColor: isGroup ? 'primary.main' : 'divider',
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="Clause"
          value={clause.type}
          onChange={(e) => handleTypeChange(e.target.value as Clause['type'])}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="equals">{CLAUSE_TYPE_LABEL.equals}</MenuItem>
          <MenuItem value="in">{CLAUSE_TYPE_LABEL.in}</MenuItem>
          <MenuItem value="all_of">{CLAUSE_TYPE_LABEL.all_of}</MenuItem>
          <MenuItem value="any_of">{CLAUSE_TYPE_LABEL.any_of}</MenuItem>
        </TextField>

        {(clause.type === 'equals' || clause.type === 'in') && (
          <FieldPicker
            fields={fields}
            value={clause.field}
            onChange={(field) =>
              clause.type === 'equals'
                ? onChange({ ...clause, field, value: '' })
                : onChange({ ...clause, field, values: [] })
            }
          />
        )}

        <Box sx={{ flex: 1 }} />
        {onRemove && (
          <IconButton aria-label="remove clause" size="small" onClick={onRemove}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {clause.type === 'equals' && (
        <Box sx={{ mt: 1.5 }}>
          <ScalarValueInput
            field={fields.find((f) => f.key === clause.field)}
            value={clause.value}
            onChange={(value) => onChange({ ...clause, value })}
          />
        </Box>
      )}

      {clause.type === 'in' && (
        <Box sx={{ mt: 1.5 }}>
          <MultiValueInput
            field={fields.find((f) => f.key === clause.field)}
            values={clause.values}
            onChange={(values) => onChange({ ...clause, values })}
          />
        </Box>
      )}

      {isGroup && (
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {(clause as AllOfClause | AnyOfClause).clauses.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No sub-clauses yet. Add at least one for this group to evaluate.
            </Typography>
          )}
          {(clause as AllOfClause | AnyOfClause).clauses.map((sub, idx) => (
            <ClauseEditor
              key={idx}
              clause={sub}
              fields={fields}
              onChange={(next) => updateChild(idx, next)}
              onRemove={() => removeChild(idx)}
              depth={depth + 1}
            />
          ))}
          <Box>
            <Button size="small" startIcon={<AddIcon />} onClick={addChild}>
              Add sub-clause
            </Button>
          </Box>
        </Stack>
      )}
    </Paper>
  )
}

function FieldPicker({
  fields,
  value,
  onChange,
}: {
  fields: ObservationField[]
  value: string
  onChange: (key: string) => void
}) {
  // Logical clauses operate on top-level fields; nested list-of-object children
  // would need bracket-path support that the evaluator doesn't have here.
  const options = fields.filter((f) => f.type !== 'list_of_object' && !f.deprecated_at)
  const isUnknown = !!value && !options.find((f) => f.key === value)
  return (
    <TextField
      select
      size="small"
      label="Field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 240 }}
      error={isUnknown}
      // Only render helperText when there's something to say — an empty
      // placeholder reserves a row of vertical space and visually mismatches
      // the Clause picker next to us.
      helperText={isUnknown ? `'${value}' is not in the registry` : undefined}
      SelectProps={{
        // Closed state: show only the human label so the dropdown chevron
        // isn't crowded by the (type) hint.
        renderValue: (selected) => {
          const v = selected as string
          const found = options.find((f) => f.key === v)
          return found ? found.label : v || ''
        },
      }}
    >
      {options.length === 0 && <MenuItem value="">No fields available</MenuItem>}
      {/* Render the current value even if it's not in the registry, so the user
          isn't silently switched off it on first render. */}
      {isUnknown && (
        <MenuItem value={value}>
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ width: '100%' }}>
            <Typography variant="body2">{value}</Typography>
            <Typography variant="caption" color="warning.main">
              unknown
            </Typography>
          </Stack>
        </MenuItem>
      )}
      {options.map((f) => (
        <MenuItem key={f.key} value={f.key}>
          <Stack
            direction="row"
            alignItems="baseline"
            justifyContent="space-between"
            spacing={1}
            sx={{ width: '100%' }}
          >
            <Typography variant="body2">{f.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              {f.type}
            </Typography>
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  )
}

function ScalarValueInput({
  field,
  value,
  onChange,
}: {
  field: ObservationField | undefined
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (!field) {
    return (
      <Typography variant="caption" color="text.secondary">
        Pick a field above to choose a value.
      </Typography>
    )
  }
  if (field.type === 'enum') {
    const allowed = field.allowed_values ?? []
    const labels = field.value_labels ?? {}
    return (
      <TextField
        select
        fullWidth
        size="small"
        label="Value"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <MenuItem value="">—</MenuItem>
        {allowed.map((code) => (
          <MenuItem key={code} value={code}>
            {labels[code] ?? code}
          </MenuItem>
        ))}
      </TextField>
    )
  }
  if (field.type === 'number') {
    return (
      <TextField
        fullWidth
        size="small"
        type="number"
        label="Value"
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange('')
            return
          }
          const n = Number(raw)
          onChange(Number.isNaN(n) ? raw : n)
        }}
      />
    )
  }
  if (field.type === 'boolean') {
    const current = value === true ? 'true' : value === false ? 'false' : ''
    return (
      <TextField
        select
        fullWidth
        size="small"
        label="Value"
        value={current}
        onChange={(e) => onChange(e.target.value === 'true')}
      >
        <MenuItem value="">—</MenuItem>
        <MenuItem value="true">true</MenuItem>
        <MenuItem value="false">false</MenuItem>
      </TextField>
    )
  }
  return (
    <TextField
      fullWidth
      size="small"
      label="Value"
      value={typeof value === 'string' ? value : String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function MultiValueInput({
  field,
  values,
  onChange,
}: {
  field: ObservationField | undefined
  values: unknown[]
  onChange: (values: unknown[]) => void
}) {
  if (!field) {
    return (
      <Typography variant="caption" color="text.secondary">
        Pick a field above to choose values.
      </Typography>
    )
  }
  if (field.type !== 'enum') {
    return (
      <Typography variant="caption" color="warning.main">
        "is one of" is supported for enum fields. Pick an enum field, or change the
        clause type to "is exactly".
      </Typography>
    )
  }
  const allowed = field.allowed_values ?? []
  const labels = field.value_labels ?? {}
  const stringValues = values.filter((v): v is string => typeof v === 'string')
  return (
    <Autocomplete
      multiple
      size="small"
      options={allowed}
      value={stringValues}
      onChange={(_, next) => onChange(next)}
      getOptionLabel={(opt) => labels[opt] ?? opt}
      renderTags={(value, getTagProps) =>
        value.map((opt, idx) => {
          const tagProps = getTagProps({ index: idx })
          return (
            <Chip
              {...tagProps}
              key={opt}
              label={labels[opt] ?? opt}
              size="small"
            />
          )
        })
      }
      renderInput={(params) => <TextField {...params} label="Values" />}
    />
  )
}
