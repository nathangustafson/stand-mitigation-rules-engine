import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Add as AddIcon,
  Block as BlockIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import {
  createObservationField,
  deleteObservationField,
  listObservationFields,
  updateObservationField,
  type ObservationField,
  type ObservationFieldCreate,
} from '../../api/client'
import Breadcrumbs from '../../components/Breadcrumbs'
import ConfirmDialog from '../../components/ConfirmDialog'
import FieldFormDialog from '../../components/manage/FieldFormDialog'
import type { UserType } from '../../types'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; field: ObservationField }

interface Props {
  userType: UserType
}

export default function FieldsManagePage({ userType }: Props) {
  const [fields, setFields] = useState<ObservationField[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ObservationField | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [menu, setMenu] = useState<{
    anchor: HTMLElement
    field: ObservationField
  } | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      setFields(await listObservationFields())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (userType !== 'applied_sciences') {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (payload: ObservationFieldCreate) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (dialog.kind === 'create') {
        await createObservationField(payload)
      } else if (dialog.kind === 'edit') {
        const { key, ...rest } = payload
        void key
        await updateObservationField(dialog.field.id, rest)
      }
      setDialog({ kind: 'closed' })
      await refresh()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleDeprecation = async (field: ObservationField) => {
    try {
      await updateObservationField(field.id, { deprecated: !field.deprecated_at })
      await refresh()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteObservationField(confirmDelete.id)
      setConfirmDelete(null)
      await refresh()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  const openMenu = (e: React.MouseEvent<HTMLElement>, field: ObservationField) =>
    setMenu({ anchor: e.currentTarget, field })
  const closeMenu = () => setMenu(null)

  return (
    <Stack spacing={2}>
      <Breadcrumbs
        items={[
          { label: 'Applied Sciences', to: '/' },
          { label: 'Observation fields' },
        ]}
      />
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Observation fields</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ kind: 'create' })}
        >
          New field
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Fields drive the underwriter's capture form and the rule editor's
        autocomplete. Adding a field here makes it appear in the form on next
        page load — no code changes.
      </Typography>

      {loadError && <Alert severity="error">{loadError}</Alert>}

      {fields === null && !loadError && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {fields && fields.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No fields yet. Click <strong>New field</strong>.
        </Typography>
      )}

      {fields && fields.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Key</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Group</TableCell>
                <TableCell>Allowed values</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((f) => {
                const deprecated = Boolean(f.deprecated_at)
                return (
                  <TableRow key={f.id} hover sx={{ opacity: deprecated ? 0.55 : 1 }}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {f.key}
                      </Typography>
                    </TableCell>
                    <TableCell>{f.label}</TableCell>
                    <TableCell>
                      <Chip size="small" label={f.type} variant="outlined" />
                    </TableCell>
                    <TableCell>{f.group_label ?? '—'}</TableCell>
                    <TableCell>
                      {f.allowed_values && f.allowed_values.length > 0
                        ? f.allowed_values.join(', ')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={deprecated ? 'deprecated' : 'active'}
                        color={deprecated ? 'default' : 'success'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label="actions"
                        onClick={(e) => openMenu(e, f)}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menu) setDialog({ kind: 'edit', field: menu.field })
            closeMenu()
          }}
        >
          <EditIcon fontSize="small" style={{ marginRight: 8 }} /> Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) void toggleDeprecation(menu.field)
            closeMenu()
          }}
        >
          {menu?.field.deprecated_at ? (
            <>
              <RestoreIcon fontSize="small" style={{ marginRight: 8 }} /> Reactivate
            </>
          ) : (
            <>
              <BlockIcon fontSize="small" style={{ marginRight: 8 }} /> Deprecate
            </>
          )}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setConfirmDelete(menu.field)
            closeMenu()
          }}
        >
          <DeleteIcon fontSize="small" style={{ marginRight: 8 }} /> Delete
        </MenuItem>
      </Menu>

      <FieldFormDialog
        open={dialog.kind !== 'closed'}
        mode={dialog.kind === 'edit' ? 'edit' : 'create'}
        initial={dialog.kind === 'edit' ? dialog.field : null}
        loading={submitting}
        error={submitError}
        onCancel={() => setDialog({ kind: 'closed' })}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete field"
        message={
          confirmDelete
            ? `Permanently delete field "${confirmDelete.key}"? Existing observations using this key will keep their saved values.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </Stack>
  )
}
