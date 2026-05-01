import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Clear as ClearIcon } from '@mui/icons-material'
import {
  evaluateObservation,
  type EvaluationResult,
  type Observation,
} from '../api/client'
import EvaluationResultView from './EvaluationResultView'

interface Props {
  propertyId: number
  observation: Observation | null
  isLatest: boolean
}

// Format a Date as the YYYY-MM-DD string an <input type="date"> expects.
const toDateInputValue = (d: Date): string => {
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${yr}-${mo}-${da}`
}

export default function PropertyEvaluationPanel({ propertyId, observation, isLatest }: Props) {
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Empty string means "use current rules" — no as_of filter applied.
  const [asOfDate, setAsOfDate] = useState<string>('')

  // Translate the YYYY-MM-DD into an end-of-day ISO so a rule created on the
  // chosen date is still considered "in scope".
  const asOfIso = asOfDate ? new Date(`${asOfDate}T23:59:59`).toISOString() : null

  useEffect(() => {
    if (observation === null) {
      setResult(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    evaluateObservation(propertyId, observation.id, { asOf: asOfIso })
      .then((r) => {
        if (cancelled) return
        setResult(r)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [propertyId, observation?.id, asOfIso])

  return (
    <Card>
      <CardContent>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          // match the Observations card's header height (the "Capture" contained
          // button on that side sets the row height to ~40px). Without this the
          // two columns' content would start at different Y positions.
          sx={{ mb: 2, minHeight: 40 }}
        >
          <Typography variant="h6">Evaluation</Typography>
          {observation && (
            <>
              <Typography variant="body2" color="text.secondary">
                · Observed {new Date(observation.captured_at).toLocaleString()}
              </Typography>
              <Chip
                size="small"
                label={isLatest ? 'latest' : 'historical'}
                color={isLatest ? 'primary' : 'default'}
                variant="outlined"
              />
            </>
          )}
          <Box sx={{ flex: 1 }} />
          {observation && (
            <Tooltip title="Use only rules and mitigations that existed on or before this date. Leave blank to use the current rule set.">
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <TextField
                  size="small"
                  label="Rules as of"
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  inputProps={{ max: toDateInputValue(new Date()) }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                {asOfDate && (
                  <IconButton
                    aria-label="clear as-of date"
                    size="small"
                    onClick={() => setAsOfDate('')}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            </Tooltip>
          )}
          {loading && <CircularProgress size={20} />}
        </Stack>

        {asOfDate && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Showing only rules and mitigations created on or before{' '}
            {new Date(`${asOfDate}T23:59:59`).toLocaleDateString()}.
          </Alert>
        )}

        {!observation && (
          <Typography variant="body2" color="text.secondary">
            No observations yet — capture one to see vulnerabilities and recommended
            mitigations.
          </Typography>
        )}

        {observation && error && <Alert severity="error">{error}</Alert>}

        {observation && !error && result === null && !loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {observation && result && <EvaluationResultView result={result} />}
      </CardContent>
    </Card>
  )
}
