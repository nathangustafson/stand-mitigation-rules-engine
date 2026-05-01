import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import {
  deleteProperty,
  getProperty,
  listObservationFields,
  listObservations,
  updateProperty,
  type Observation,
  type ObservationField,
  type Property,
  type PropertyCreate,
} from '../api/client'
import Breadcrumbs from '../components/Breadcrumbs'
import ConfirmDialog from '../components/ConfirmDialog'
import ObservationCaptureForm from '../components/ObservationCaptureForm'
import PropertyEvaluationPanel from '../components/PropertyEvaluationPanel'
import PropertyFormDialog from '../components/PropertyFormDialog'
import PropertyObservationsView from '../components/PropertyObservationsView'
import { addressOneLine } from './PropertiesListPage'

export default function PropertyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const propertyId = Number(id)
  const [property, setProperty] = useState<Property | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [observations, setObservations] = useState<Observation[] | null>(null)
  const [fields, setFields] = useState<ObservationField[] | null>(null)
  const [observationsError, setObservationsError] = useState<string | null>(null)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [editingObservation, setEditingObservation] = useState<Observation | null>(null)
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setProperty(await getProperty(propertyId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [propertyId])

  const refreshObservations = useCallback(async () => {
    setObservationsError(null)
    try {
      const list = await listObservations(propertyId)
      setObservations(list)
      // Default selection to the latest if nothing's chosen yet, or if the
      // currently-selected observation no longer exists (e.g. it was deleted).
      setSelectedObservationId((curr) => {
        if (list.length === 0) return null
        if (curr === null || !list.some((o) => o.id === curr)) return list[0].id
        return curr
      })
    } catch (e) {
      setObservationsError(e instanceof Error ? e.message : String(e))
    }
  }, [propertyId])

  useEffect(() => {
    if (Number.isNaN(propertyId)) {
      setError('Invalid property id')
      return
    }
    void refresh()
    setObservationsError(null)
    Promise.all([listObservations(propertyId), listObservationFields()])
      .then(([obs, flds]) => {
        setObservations(obs)
        setFields(flds)
        if (obs.length > 0) setSelectedObservationId(obs[0].id)
      })
      .catch((e) => {
        setObservationsError(e instanceof Error ? e.message : String(e))
      })
  }, [propertyId, refresh])

  const handleEdit = async (payload: PropertyCreate) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await updateProperty(propertyId, payload)
      setEditOpen(false)
      await refresh()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteProperty(propertyId)
      navigate('/properties')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  const selectedObservation =
    observations?.find((o) => o.id === selectedObservationId) ?? null
  const isLatestSelected =
    observations !== null && observations.length > 0
      ? observations[0].id === selectedObservationId
      : false

  const detailLabel = property
    ? property.nickname || `Property #${property.id}`
    : 'Property'

  return (
    <Stack spacing={2}>
      <Breadcrumbs
        items={[
          { label: 'Underwriter', to: '/' },
          { label: 'Properties', to: '/properties' },
          { label: detailLabel },
        ]}
      />

      {error && <Alert severity="error">{error}</Alert>}

      {!property && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {property && (
        <Card>
          <CardContent>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
              <Box>
                <Typography variant="h5" gutterBottom>
                  {property.nickname || `Property #${property.id}`}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {addressOneLine(property)}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button startIcon={<EditIcon />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button
                  startIcon={<DeleteIcon />}
                  color="error"
                  onClick={() => setConfirmOpen(true)}
                >
                  Delete
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {property && (
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems="stretch"
        >
          <Box sx={{ flex: { md: 2 }, minWidth: 0 }}>
            {observationsError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {observationsError}
              </Alert>
            )}
            <PropertyEvaluationPanel
              propertyId={propertyId}
              observation={selectedObservation}
              isLatest={isLatestSelected}
            />
          </Box>

          <Box sx={{ flex: { md: 1 }, minWidth: 0 }}>
            <Card>
              <CardContent>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mb: 2 }}
                >
                  <Typography variant="h6">Observations</Typography>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setCaptureOpen(true)}
                  >
                    Capture
                  </Button>
                </Stack>

                {(observations === null || fields === null) && !observationsError && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                  </Box>
                )}

                {observations && fields && (
                  <PropertyObservationsView
                    observations={observations}
                    fields={fields}
                    selectedObservationId={selectedObservationId}
                    onSelect={setSelectedObservationId}
                    onEdit={setEditingObservation}
                  />
                )}
              </CardContent>
            </Card>
          </Box>
        </Stack>
      )}

      <PropertyFormDialog
        open={editOpen}
        mode="edit"
        initial={property}
        loading={submitting}
        error={submitError}
        onCancel={() => setEditOpen(false)}
        onSubmit={handleEdit}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete property"
        message={
          property
            ? `Permanently delete ${
                property.nickname ?? addressOneLine(property)
              }? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <Dialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Capture observation</DialogTitle>
        <DialogContent>
          {captureOpen && (
            <ObservationCaptureForm
              propertyId={propertyId}
              previousValues={
                observations && observations.length > 0
                  ? observations[0].effective_values
                  : null
              }
              onCancel={() => setCaptureOpen(false)}
              onSubmitted={(created) => {
                setCaptureOpen(false)
                setSelectedObservationId(created.id)
                void refreshObservations()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingObservation !== null}
        onClose={() => setEditingObservation(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit observation</DialogTitle>
        <DialogContent>
          {editingObservation && (
            <ObservationCaptureForm
              propertyId={propertyId}
              mode="edit"
              observation={editingObservation}
              onCancel={() => setEditingObservation(null)}
              onSubmitted={(updated) => {
                setEditingObservation(null)
                setSelectedObservationId(updated.id)
                void refreshObservations()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  )
}
