import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
} from '@mui/material'
import type { Property, PropertyCreate } from '../api/client'

type Mode = 'create' | 'edit'

interface Props {
  open: boolean
  mode: Mode
  initial?: Property | null
  loading?: boolean
  error?: string | null
  onCancel: () => void
  onSubmit: (data: PropertyCreate) => void
}

const EMPTY: PropertyCreate = {
  street: '',
  unit: '',
  city: '',
  state: '',
  zip: '',
  nickname: '',
}

const STATE_RE = /^[A-Za-z]{2}$/
const ZIP_RE = /^\d{5}(-\d{4})?$/

export default function PropertyFormDialog({
  open,
  mode,
  initial,
  loading,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<PropertyCreate>(EMPTY)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setForm({
        street: initial.street,
        unit: initial.unit ?? '',
        city: initial.city,
        state: initial.state,
        zip: initial.zip,
        nickname: initial.nickname ?? '',
      })
    } else {
      setForm(EMPTY)
    }
    setTouched({})
  }, [open, mode, initial])

  const update =
    <K extends keyof PropertyCreate>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = key === 'state' ? e.target.value.toUpperCase() : e.target.value
      setForm((prev) => ({ ...prev, [key]: value }))
    }

  const blur = (key: string) => () => setTouched((prev) => ({ ...prev, [key]: true }))

  const errors = {
    street: !form.street.trim() ? 'Street is required' : '',
    city: !form.city.trim() ? 'City is required' : '',
    state: !STATE_RE.test(form.state) ? 'Use 2-letter state code' : '',
    zip: !ZIP_RE.test(form.zip) ? 'Use 5-digit or 9-digit ZIP' : '',
  }

  const hasErrors = Object.values(errors).some(Boolean)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ street: true, city: true, state: true, zip: true })
    if (hasErrors) return
    const payload: PropertyCreate = {
      street: form.street.trim(),
      unit: form.unit?.trim() || null,
      city: form.city.trim(),
      state: form.state.toUpperCase().trim(),
      zip: form.zip.trim(),
      nickname: form.nickname?.trim() || null,
    }
    onSubmit(payload)
  }

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{mode === 'create' ? 'New property' : 'Edit property'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nickname (optional)"
                value={form.nickname ?? ''}
                onChange={update('nickname')}
                helperText="Internal label, e.g. 'Mountain rental'"
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                required
                label="Street"
                value={form.street}
                onChange={update('street')}
                onBlur={blur('street')}
                error={touched.street && Boolean(errors.street)}
                helperText={(touched.street && errors.street) || ' '}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Unit"
                value={form.unit ?? ''}
                onChange={update('unit')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                label="City"
                value={form.city}
                onChange={update('city')}
                onBlur={blur('city')}
                error={touched.city && Boolean(errors.city)}
                helperText={(touched.city && errors.city) || ' '}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                fullWidth
                required
                label="State"
                value={form.state}
                onChange={update('state')}
                onBlur={blur('state')}
                inputProps={{ maxLength: 2, style: { textTransform: 'uppercase' } }}
                error={touched.state && Boolean(errors.state)}
                helperText={(touched.state && errors.state) || ' '}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                fullWidth
                required
                label="ZIP"
                value={form.zip}
                onChange={update('zip')}
                onBlur={blur('zip')}
                error={touched.zip && Boolean(errors.zip)}
                helperText={(touched.zip && errors.zip) || ' '}
              />
            </Grid>
          </Grid>
          {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading || hasErrors}>
            {loading ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
