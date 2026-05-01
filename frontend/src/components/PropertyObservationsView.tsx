import { useMemo, useState } from 'react'
import {
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material'
import type { Observation, ObservationField } from '../api/client'

interface Props {
  observations: Observation[]
  fields: ObservationField[]
  selectedObservationId: number | null
  onSelect: (observationId: number) => void
  onEdit: (obs: Observation) => void
}

type TabKey = 'current' | 'history' | 'timeline'

export default function PropertyObservationsView({
  observations,
  fields,
  selectedObservationId,
  onSelect,
  onEdit,
}: Props) {
  const [tab, setTab] = useState<TabKey>('current')
  const chronological = useMemo(() => [...observations].reverse(), [observations])

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="fullWidth"
      >
        <Tab value="current" label="Current" />
        <Tab value="history" label="History" />
        <Tab value="timeline" label="Timeline" />
      </Tabs>

      {tab === 'current' && (
        <CurrentView
          observations={observations}
          fields={fields}
          selectedObservationId={selectedObservationId}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      )}
      {tab === 'history' && (
        <HistoryView
          observations={observations}
          fields={fields}
          selectedObservationId={selectedObservationId}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      )}
      {tab === 'timeline' && <TimelineView observations={chronological} fields={fields} />}
    </Box>
  )
}

// ---- Current ---------------------------------------------------------------

function CurrentView({
  observations,
  fields,
  selectedObservationId,
  onSelect,
  onEdit,
}: {
  observations: Observation[]
  fields: ObservationField[]
  selectedObservationId: number | null
  onSelect: (observationId: number) => void
  onEdit: (obs: Observation) => void
}) {
  const latest = observations[0]
  if (!latest) {
    return (
      <Typography variant="body2" color="text.secondary">
        No observations yet — capture one to populate the current values.
      </Typography>
    )
  }

  // Default the "Current" view to the most-recent observation, but show the
  // selected one when the user picks a historical entry on the History tab.
  const showing = observations.find((o) => o.id === selectedObservationId) ?? latest
  const isLatest = showing.id === latest.id
  const grouped = useMemo(() => groupFields(fields), [fields])

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {new Date(showing.captured_at).toLocaleString()}
        </Typography>
        <Chip
          size="small"
          label={isLatest ? 'latest' : 'historical'}
          color={isLatest ? 'primary' : 'default'}
          variant="outlined"
        />
        <Tooltip title="Edit this observation">
          <IconButton size="small" onClick={() => onEdit(showing)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {!isLatest && (
        <Box sx={{ mb: 2 }}>
          <Button size="small" onClick={() => onSelect(latest.id)}>
            Switch to latest
          </Button>
        </Box>
      )}

      <Stack spacing={1.5}>
        {grouped.map((group) => (
          <Box key={group.label}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ display: 'block', mb: 0.5 }}
            >
              {group.label}
            </Typography>
            <Stack spacing={0.5}>
              {group.fields.map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  value={showing.effective_values[f.key]}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  )
}

function FieldRow({ field, value }: { field: ObservationField; value: unknown }) {
  return (
    <Box
      sx={{
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {field.label}
      </Typography>
      <Box>{renderValue(field, value)}</Box>
    </Box>
  )
}

function renderValue(field: ObservationField, value: unknown) {
  if (value === undefined || value === null || value === '') {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    )
  }
  if (field.type === 'list_of_object' && Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <Typography variant="body2" color="text.disabled">
          (empty)
        </Typography>
      )
    }
    return (
      <Stack spacing={0.5}>
        {value.map((item, idx) => (
          <Typography key={idx} variant="body2">
            {summarizeItem(field, item)}
          </Typography>
        ))}
      </Stack>
    )
  }
  if (field.type === 'boolean') {
    return <Typography variant="body2">{value ? 'Yes' : 'No'}</Typography>
  }
  if (field.type === 'enum' && typeof value === 'string') {
    return <Typography variant="body2">{enumLabel(value, field.value_labels)}</Typography>
  }
  if (field.type === 'number' && typeof value === 'number') {
    return (
      <Typography variant="body2">
        {value}
        {field.unit ? ` ${field.unit}` : ''}
      </Typography>
    )
  }
  return <Typography variant="body2">{String(value)}</Typography>
}

function summarizeItem(field: ObservationField, item: unknown): string {
  if (typeof item !== 'object' || item === null) return String(item)
  const children = field.item_schema?.fields ?? []
  const parts: string[] = []
  for (const child of children) {
    const v = (item as Record<string, unknown>)[child.key]
    if (v === undefined || v === null || v === '') continue
    let formatted: string
    if (child.type === 'enum' && typeof v === 'string')
      formatted = enumLabel(v, child.value_labels)
    else if (child.type === 'number' && typeof v === 'number')
      formatted = `${v}${child.unit ? ` ${child.unit}` : ''}`
    else formatted = String(v)
    parts.push(`${child.label}: ${formatted}`)
  }
  return parts.join(' · ') || JSON.stringify(item)
}

// ---- History ---------------------------------------------------------------

function HistoryView({
  observations,
  fields,
  selectedObservationId,
  onSelect,
  onEdit,
}: {
  observations: Observation[]
  fields: ObservationField[]
  selectedObservationId: number | null
  onSelect: (observationId: number) => void
  onEdit: (obs: Observation) => void
}) {
  if (observations.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No observations yet.
      </Typography>
    )
  }
  const labels = useMemo(() => labelMap(fields), [fields])
  const listKeys = useMemo(
    () => new Set(fields.filter((f) => f.type === 'list_of_object').map((f) => f.key)),
    [fields],
  )
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Click a row to evaluate that observation in the panel on the left.
      </Typography>
      {observations.map((obs) => {
        const selected = obs.id === selectedObservationId
        return (
          <Paper
            key={obs.id}
            variant="outlined"
            sx={{
              borderColor: selected ? 'primary.main' : 'divider',
              borderWidth: selected ? 2 : 1,
              overflow: 'hidden',
            }}
          >
            <Accordion
              disableGutters
              elevation={0}
              square
              sx={{
                background: 'transparent',
                // override default AccordionSummary content flex so the inner
                // Stack respects the column width and the summary text can
                // ellipsis-truncate instead of overflowing.
                '& .MuiAccordionSummary-content': { minWidth: 0, my: 1 },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                onClick={() => onSelect(obs.id)}
                sx={{ cursor: 'pointer', minHeight: 0 }}
              >
                <Stack spacing={0.25} sx={{ minWidth: 0, width: '100%' }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ gap: 1, minWidth: 0 }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={selected ? 600 : 400}
                      noWrap
                      sx={{ minWidth: 0 }}
                    >
                      {new Date(obs.captured_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Typography>
                    {selected && (
                      <Chip
                        size="small"
                        label="evaluating"
                        color="primary"
                        sx={{
                          height: 18,
                          flexShrink: 0,
                          '& .MuiChip-label': { px: 0.75, fontSize: 10 },
                        }}
                      />
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}
                  >
                    {summarizeValues(obs.values, labels, listKeys, 2)}
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(obs.values, null, 2)}
                  </Box>
                  <Stack direction="row" justifyContent="flex-end">
                    <Button size="small" startIcon={<EditIcon />} onClick={() => onEdit(obs)}>
                      Edit
                    </Button>
                  </Stack>
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Paper>
        )
      })}
    </Stack>
  )
}

// ---- Timeline --------------------------------------------------------------

function TimelineView({
  observations,
  fields,
}: {
  observations: Observation[]
  fields: ObservationField[]
}) {
  if (observations.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No observations yet.
      </Typography>
    )
  }
  const fieldByKey = useMemo(
    () => new Map(fields.map((f) => [f.key, f])),
    [fields],
  )
  return (
    <Stack spacing={2.5}>
      {observations.map((obs, idx) => {
        const previous = idx === 0 ? null : observations[idx - 1]
        return (
          <TimelineEntry
            key={obs.id}
            observation={obs}
            previous={previous}
            fieldByKey={fieldByKey}
            isFirst={idx === 0}
          />
        )
      })}
    </Stack>
  )
}

function TimelineEntry({
  observation,
  previous,
  fieldByKey,
  isFirst,
}: {
  observation: Observation
  previous: Observation | null
  fieldByKey: Map<string, ObservationField>
  isFirst: boolean
}) {
  const ts = new Date(observation.captured_at)
  // For the first observation, render every field present in effective_values
  // (the initial captured state). For subsequent observations, diff effective
  // values so changes are honest even when individual observations are sparse.
  const changes = isFirst
    ? Array.from(fieldByKey.entries())
        .map(([key, field]) => ({
          key,
          field,
          before: undefined as unknown,
          after: observation.effective_values[key],
        }))
        .filter((c) => c.after !== undefined && c.after !== null && c.after !== '')
    : diff(previous!, observation, fieldByKey)

  return (
    <Box sx={{ position: 'relative', pl: 4 }}>
      <Box
        sx={{
          position: 'absolute',
          left: 8,
          top: 6,
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: 'primary.main',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: 13,
          top: 18,
          bottom: -20,
          width: 2,
          bgcolor: 'divider',
        }}
      />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>
          {ts.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </Typography>
        <Chip size="small" label={isFirst ? 'initial' : 'updated'} variant="outlined" />
        <Typography variant="caption" color="text.secondary">
          {ts.toLocaleTimeString()}
        </Typography>
      </Stack>
      {changes.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No tracked-field changes since previous observation.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {changes.map((c) => (
            <ChangeRow key={c.key} field={c.field} before={c.before} after={c.after} isFirst={isFirst} />
          ))}
        </Stack>
      )}
    </Box>
  )
}

function ChangeRow({
  field,
  before,
  after,
  isFirst,
}: {
  field: ObservationField
  before: unknown
  after: unknown
  isFirst: boolean
}) {
  // List-of-object fields aren't a single value that morphs — they're a
  // collection where individual items get added or removed. A shrub at 5ft
  // and a tree at 60ft aren't "the same item that changed"; one was removed,
  // the other added (or relocated — the system can't infer intent from
  // values alone, so it surfaces both halves of the change honestly).
  if (field.type === 'list_of_object' && !isFirst) {
    return <ListChangeRow field={field} before={before} after={after} />
  }
  return (
    <Typography variant="body2">
      <Box component="span" color="text.secondary">
        {field.label}:
      </Box>{' '}
      {isFirst ? (
        formatTimelineValue(field, after)
      ) : (
        <>
          <Box component="span" sx={{ textDecoration: 'line-through', color: 'text.disabled' }}>
            {formatTimelineValue(field, before)}
          </Box>{' '}
          →{' '}
          <Box component="span" fontWeight={500}>
            {formatTimelineValue(field, after)}
          </Box>
        </>
      )}
    </Typography>
  )
}

function ListChangeRow({
  field,
  before,
  after,
}: {
  field: ObservationField
  before: unknown
  after: unknown
}) {
  const beforeArr = Array.isArray(before) ? before : []
  const afterArr = Array.isArray(after) ? after : []
  const beforeKeys = beforeArr.map(stableKey)
  const afterKeys = afterArr.map(stableKey)
  const beforeSet = new Set(beforeKeys)
  const afterSet = new Set(afterKeys)
  const removed = beforeArr.filter((_, idx) => !afterSet.has(beforeKeys[idx]))
  const added = afterArr.filter((_, idx) => !beforeSet.has(afterKeys[idx]))

  if (removed.length === 0 && added.length === 0) {
    // shouldn't happen given diff() already filtered identical lists, but be safe
    return null
  }

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 0.25 }}>
        <Box component="span" color="text.secondary">
          {field.label}:
        </Box>{' '}
        <Box component="span" color="text.secondary" fontStyle="italic">
          {summarizeListChange(removed.length, added.length)}
        </Box>
      </Typography>
      <Stack spacing={0.25} sx={{ ml: 2 }}>
        {removed.map((item, idx) => (
          <Stack key={`r-${idx}`} direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label="removed"
              color="error"
              variant="outlined"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
            />
            <Typography
              variant="body2"
              sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
            >
              {summarizeItem(field, item)}
            </Typography>
          </Stack>
        ))}
        {added.map((item, idx) => (
          <Stack key={`a-${idx}`} direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label="added"
              color="success"
              variant="outlined"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
            />
            <Typography variant="body2" fontWeight={500}>
              {summarizeItem(field, item)}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}

function stableKey(item: unknown): string {
  if (typeof item !== 'object' || item === null) return JSON.stringify(item)
  // Sort keys so {a:1,b:2} and {b:2,a:1} produce the same string.
  const sorted = Object.fromEntries(
    Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
  )
  return JSON.stringify(sorted)
}

function summarizeListChange(removedCount: number, addedCount: number): string {
  const parts: string[] = []
  if (addedCount > 0) parts.push(`${addedCount} added`)
  if (removedCount > 0) parts.push(`${removedCount} removed`)
  return parts.join(', ')
}

function diff(
  prev: Observation,
  curr: Observation,
  fieldByKey: Map<string, ObservationField>,
): { key: string; field: ObservationField; before: unknown; after: unknown }[] {
  const out: { key: string; field: ObservationField; before: unknown; after: unknown }[] = []
  for (const [key, field] of fieldByKey.entries()) {
    // Compare the merged state at each observation, so diffs reflect what
    // actually changed about the property (not just which keys were re-
    // captured in this row's sparse values dict).
    const before = prev.effective_values[key]
    const after = curr.effective_values[key]
    if (sameValue(before, after)) continue
    out.push({ key, field, before, after })
  }
  return out
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function formatTimelineValue(field: ObservationField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (field.type === 'enum' && typeof value === 'string')
    return enumLabel(value, field.value_labels)
  if (field.type === 'number' && typeof value === 'number')
    return `${value}${field.unit ? ` ${field.unit}` : ''}`
  if (field.type === 'boolean') return value ? 'Yes' : 'No'
  if (field.type === 'list_of_object' && Array.isArray(value)) {
    if (value.length === 0) return '(empty)'
    return value.map((item) => summarizeItem(field, item)).join('; ')
  }
  return String(value)
}

// ---- shared utilities ------------------------------------------------------

interface FieldGroup {
  label: string
  fields: ObservationField[]
}

function groupFields(fields: ObservationField[]): FieldGroup[] {
  const order: string[] = []
  const buckets = new Map<string, ObservationField[]>()
  for (const f of fields) {
    if (f.deprecated_at) continue
    const key = f.group_label ?? '__default__'
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(f)
  }
  return order.map((k) => ({
    label: k === '__default__' ? 'Other' : k,
    fields: buckets.get(k)!.sort((a, b) => a.sort_order - b.sort_order),
  }))
}

function labelMap(fields: ObservationField[]): Map<string, string> {
  return new Map(fields.map((f) => [f.key, f.label]))
}

function summarizeValues(
  values: Record<string, unknown>,
  labels: Map<string, string>,
  listKeys: Set<string>,
  limit: number = 4,
): string {
  const entries = Object.entries(values).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return '(no values)'
  const shown = entries.slice(0, limit)
  const parts = shown.map(([key, value]) => {
    const label = labels.get(key) ?? key
    if (listKeys.has(key) && Array.isArray(value)) {
      return `${label}: ${value.length} item${value.length === 1 ? '' : 's'}`
    }
    return `${label}: ${formatScalar(value)}`
  })
  if (entries.length > limit) parts.push('…')
  return parts.join(', ')
}

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  return JSON.stringify(value)
}

function enumLabel(value: string, labels?: Record<string, string> | null): string {
  return labels?.[value] ?? value
}
