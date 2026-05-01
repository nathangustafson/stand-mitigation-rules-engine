import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  Add as AddIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import {
  deleteRule,
  getRule,
  listObservationFields,
  updateRule,
  type ObservationField,
  type Rule,
  type RuleType,
  type Severity,
} from '../../api/client'
import Breadcrumbs from '../../components/Breadcrumbs'
import ConfirmDialog from '../../components/ConfirmDialog'
import ClauseEditor, { type Clause } from '../../components/manage/ClauseEditor'
import JsonEditor from '../../components/manage/JsonEditor'
import MitigationCard from '../../components/manage/MitigationCard'
import RuleTestCard from '../../components/manage/RuleTestCard'
import type { UserType } from '../../types'

interface Props {
  userType: UserType
}

const TYPE_COLOR: Record<RuleType, 'default' | 'info' | 'warning'> = {
  boolean: 'default',
  logical: 'info',
  parameterized: 'warning',
}

const SEVERITY_COLOR: Record<Severity, 'info' | 'warning' | 'error'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
}

const TYPE_HINTS: Record<RuleType, string> = {
  boolean: 'Shape: { "type": "boolean", "field": "<key>", "must_equal": <value> }',
  logical:
    'Shape: { "type": "logical", "clause": <clause> } where clause is one of equals/in/all_of/any_of (recursive).',
  parameterized:
    'Shape: { "type": "parameterized", "base": N, "unit": "ft", "modifiers": [...], "compare_field": "...", "compare_op": ">=" }',
}

export default function RuleDetailPage({ userType }: Props) {
  const { id } = useParams()
  const navigate = useNavigate()
  const ruleId = Number(id)

  const [rule, setRule] = useState<Rule | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [shellEditing, setShellEditing] = useState(false)
  const [shellName, setShellName] = useState('')
  const [shellDescription, setShellDescription] = useState('')
  const [shellPriority, setShellPriority] = useState(0)
  const [shellSeverity, setShellSeverity] = useState<Severity>('medium')
  const [shellSaving, setShellSaving] = useState(false)
  const [shellError, setShellError] = useState<string | null>(null)

  const [bodyDraft, setBodyDraft] = useState<Record<string, unknown> | null>(null)
  const [bodyValid, setBodyValid] = useState(true)
  const [bodyDirty, setBodyDirty] = useState(false)
  const [bodySaving, setBodySaving] = useState(false)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [bodyView, setBodyView] = useState<'structured' | 'json'>('json')
  const [fields, setFields] = useState<ObservationField[]>([])

  const [addingMitigation, setAddingMitigation] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const next = await getRule(ruleId)
      setRule(next)
      setBodyDraft(next.body)
      setBodyDirty(false)
      setBodyValid(true)
      // Default to the structured editor for logical rules; JSON for the rest.
      setBodyView(next.type === 'logical' ? 'structured' : 'json')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [ruleId])

  useEffect(() => {
    if (Number.isNaN(ruleId)) {
      setLoadError('Invalid rule id')
      return
    }
    void refresh()
  }, [ruleId, refresh])

  // Field registry powers the structured clause editor's field/value dropdowns.
  // Loaded lazily; the JSON tab still works if this fails.
  useEffect(() => {
    let cancelled = false
    listObservationFields()
      .then((data) => {
        if (!cancelled) setFields(data)
      })
      .catch(() => {
        if (!cancelled) setFields([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (userType !== 'applied_sciences') {
    return <Navigate to="/" replace />
  }

  const beginShellEdit = () => {
    if (!rule) return
    setShellName(rule.name)
    setShellDescription(rule.description)
    setShellPriority(rule.priority)
    setShellSeverity(rule.severity)
    setShellError(null)
    setShellEditing(true)
  }

  const cancelShellEdit = () => {
    setShellEditing(false)
    setShellError(null)
  }

  const saveShell = async () => {
    if (!rule) return
    setShellSaving(true)
    setShellError(null)
    try {
      await updateRule(rule.id, {
        name: shellName.trim(),
        description: shellDescription.trim(),
        priority: shellPriority,
        severity: shellSeverity,
      })
      setShellEditing(false)
      await refresh()
    } catch (e) {
      setShellError(e instanceof Error ? e.message : String(e))
    } finally {
      setShellSaving(false)
    }
  }

  const toggleEnabled = async (next: boolean) => {
    if (!rule) return
    try {
      await updateRule(rule.id, { enabled: next })
      await refresh()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }

  const saveBody = async () => {
    if (!rule || !bodyDraft) return
    setBodySaving(true)
    setBodyError(null)
    try {
      await updateRule(rule.id, { body: bodyDraft })
      await refresh()
    } catch (e) {
      setBodyError(e instanceof Error ? e.message : String(e))
    } finally {
      setBodySaving(false)
    }
  }

  const handleDeleteRule = async () => {
    if (!rule) return
    setDeleting(true)
    try {
      await deleteRule(rule.id)
      navigate('/manage/rules')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const canSaveShell = shellName.trim().length > 0 && !shellSaving

  return (
    <Stack spacing={2}>
      <Breadcrumbs
        items={[
          { label: 'Applied Sciences', to: '/' },
          { label: 'Rules', to: '/manage/rules' },
          { label: rule?.name ?? 'Rule' },
        ]}
      />

      {loadError && <Alert severity="error">{loadError}</Alert>}

      {!rule && !loadError && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {rule && (
        <>
          <Card>
            <CardContent>
              {shellEditing ? (
                <Stack spacing={2}>
                  {shellError && <Alert severity="error">{shellError}</Alert>}
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        required
                        label="Name"
                        value={shellName}
                        onChange={(e) => setShellName(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Priority"
                        value={shellPriority}
                        onChange={(e) => setShellPriority(Number(e.target.value))}
                        helperText="Evaluation order"
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField
                        select
                        fullWidth
                        label="Severity"
                        value={shellSeverity}
                        onChange={(e) => setShellSeverity(e.target.value as Severity)}
                        helperText="Finding badness"
                      >
                        <MenuItem value="low">low</MenuItem>
                        <MenuItem value="medium">medium</MenuItem>
                        <MenuItem value="high">high</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        label="Description"
                        value={shellDescription}
                        onChange={(e) => setShellDescription(e.target.value)}
                      />
                    </Grid>
                  </Grid>
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button onClick={cancelShellEdit} disabled={shellSaving}>
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => void saveShell()}
                      disabled={!canSaveShell}
                    >
                      {shellSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="h5" sx={{ flexGrow: 1 }}>
                      {rule.name}
                    </Typography>
                    <Chip size="small" label={rule.type} color={TYPE_COLOR[rule.type]} />
                    <IconButton size="small" aria-label="edit" onClick={beginShellEdit}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  {rule.description && (
                    <Typography variant="body2" color="text.secondary">
                      {rule.description}
                    </Typography>
                  )}
                  <Stack direction="row" alignItems="center" spacing={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Priority
                      </Typography>
                      <Typography variant="body2">{rule.priority}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Severity
                      </Typography>
                      <Chip
                        size="small"
                        label={rule.severity}
                        color={SEVERITY_COLOR[rule.severity]}
                      />
                    </Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={rule.enabled}
                          onChange={(e) => void toggleEnabled(e.target.checked)}
                        />
                      }
                      label="Enabled"
                    />
                  </Stack>
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="h6">Rule body</Typography>
                    <Chip
                      size="small"
                      label={rule.type}
                      color={TYPE_COLOR[rule.type]}
                      variant="outlined"
                    />
                  </Stack>
                  {rule.type === 'logical' && (
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
                {bodyError && <Alert severity="error">{bodyError}</Alert>}

                {rule.type === 'logical' && bodyView === 'structured' ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      Compose clauses with AND / OR groups. Switch to JSON for the raw shape.
                    </Typography>
                    <ClauseEditor
                      clause={
                        ((bodyDraft?.clause ?? (rule.body as Record<string, unknown>).clause) as Clause) ??
                        ({ type: 'all_of', clauses: [] } as Clause)
                      }
                      fields={fields}
                      onChange={(nextClause) => {
                        const baseBody =
                          bodyDraft ?? (rule.body as Record<string, unknown>)
                        setBodyDraft({
                          ...baseBody,
                          type: 'logical',
                          clause: nextClause as unknown as Record<string, unknown>,
                        })
                        setBodyDirty(true)
                        setBodyValid(true)
                      }}
                    />
                  </Box>
                ) : (
                  <JsonEditor
                    label="body"
                    value={rule.body}
                    onChange={(next, valid) => {
                      setBodyValid(valid)
                      setBodyDirty(true)
                      if (valid && next && typeof next === 'object') {
                        setBodyDraft(next as Record<string, unknown>)
                      }
                    }}
                    helperText={TYPE_HINTS[rule.type]}
                  />
                )}

                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    onClick={() => void saveBody()}
                    disabled={!bodyValid || !bodyDirty || bodySaving}
                  >
                    {bodySaving ? 'Saving…' : 'Save body'}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="h6">Mitigations</Typography>
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => setAddingMitigation(true)}
                    disabled={addingMitigation}
                  >
                    Add mitigation
                  </Button>
                </Stack>

                {rule.mitigations.length === 0 && !addingMitigation && (
                  <Typography variant="body2" color="text.secondary">
                    No mitigations yet — click <strong>Add mitigation</strong> to attach one.
                  </Typography>
                )}

                <Stack spacing={1.5}>
                  {rule.mitigations.map((m) => (
                    <MitigationCard
                      key={m.id}
                      ruleId={rule.id}
                      mitigation={m}
                      onSaved={() => void refresh()}
                    />
                  ))}
                  {addingMitigation && (
                    <MitigationCard
                      key="new"
                      ruleId={rule.id}
                      onSaved={() => {
                        setAddingMitigation(false)
                        void refresh()
                      }}
                      onCancelCreate={() => setAddingMitigation(false)}
                    />
                  )}
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <RuleTestCard ruleId={rule.id} />

          <Box>
            <Button
              size="small"
              color="error"
              variant="text"
              onClick={() => setConfirmDelete(true)}
            >
              Delete this rule
            </Button>
          </Box>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete rule"
        message={
          rule
            ? `Permanently delete "${rule.name}"? This removes its mitigations too.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void handleDeleteRule()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Stack>
  )
}
