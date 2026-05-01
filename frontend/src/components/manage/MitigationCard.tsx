import { useState } from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  addMitigation,
  deleteMitigation,
  updateMitigation,
  type Mitigation,
  type MitigationInput,
  type MitigationTier,
} from '../../api/client'
import ConfirmDialog from '../ConfirmDialog'

interface Props {
  ruleId: number
  mitigation?: Mitigation | null
  onSaved: () => void
  onCancelCreate?: () => void
}

const TIER_COLOR: Record<MitigationTier, 'primary' | 'warning'> = {
  full: 'primary',
  bridge: 'warning',
}

interface FormState {
  tier: MitigationTier
  name: string
  description: string
  effect: string
  sort_order: number
}

function initialFormState(mitigation?: Mitigation | null): FormState {
  if (!mitigation) {
    return { tier: 'full', name: '', description: '', effect: '', sort_order: 10 }
  }
  return {
    tier: mitigation.tier,
    name: mitigation.name,
    description: mitigation.description,
    effect: mitigation.effect ?? '',
    sort_order: mitigation.sort_order,
  }
}

export default function MitigationCard({
  ruleId,
  mitigation,
  onSaved,
  onCancelCreate,
}: Props) {
  const isNew = !mitigation
  const [editing, setEditing] = useState<boolean>(isNew)
  const [form, setForm] = useState<FormState>(initialFormState(mitigation))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const beginEdit = () => {
    setForm(initialFormState(mitigation))
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setError(null)
    if (mitigation) {
      setForm(initialFormState(mitigation))
      setEditing(false)
    } else {
      onCancelCreate?.()
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const payload: MitigationInput = {
      tier: form.tier,
      name: form.name.trim(),
      description: form.description.trim(),
      effect: form.effect.trim() || null,
      sort_order: form.sort_order,
    }
    try {
      if (mitigation?.id) {
        await updateMitigation(ruleId, mitigation.id, payload)
      } else {
        await addMitigation(ruleId, payload)
      }
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!mitigation) return
    setDeleting(true)
    setError(null)
    try {
      await deleteMitigation(ruleId, mitigation.id)
      setConfirmOpen(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  if (editing) {
    const canSave = form.name.trim().length > 0 && !saving
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <TextField
                select
                fullWidth
                label="Tier"
                value={form.tier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tier: e.target.value as MitigationTier }))
                }
              >
                <MenuItem value="full">full</MenuItem>
                <MenuItem value="bridge">bridge</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6} sm={6}>
              <TextField
                fullWidth
                required
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="number"
                label="Sort order"
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                minRows={2}
                label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Effect (optional)"
                placeholder="e.g. -20% to safe distance"
                value={form.effect}
                onChange={(e) => setForm((f) => ({ ...f, effect: e.target.value }))}
              />
            </Grid>
          </Grid>
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void save()} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    )
  }

  if (!mitigation) return null

  return (
    <>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Chip
              size="small"
              label={mitigation.tier}
              color={TIER_COLOR[mitigation.tier]}
            />
            <Typography variant="body1" fontWeight={600} sx={{ flexGrow: 1 }}>
              {mitigation.name}
            </Typography>
            <IconButton size="small" aria-label="edit" onClick={beginEdit}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="delete"
              onClick={() => setConfirmOpen(true)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {mitigation.description}
          </Typography>
          {mitigation.effect && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Effect: {mitigation.effect}
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete mitigation"
        message={`Delete mitigation "${mitigation.name}"?`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
