import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import type {
  EvaluationResult,
  Mitigation,
  Severity,
  Vulnerability,
} from '../api/client'

const SEVERITY_COLOR: Record<Severity, 'info' | 'warning' | 'error'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
}

interface Props {
  result: EvaluationResult
}

export default function EvaluationResultView({ result }: Props) {
  const noVulns = result.vulnerabilities.length === 0

  // Index mitigations by their owning rule_id so each vulnerability card can
  // pull its own actions inline rather than the user having to scan a flat
  // list at the bottom.
  const mitigationsByRule = new Map<number, { full: Mitigation[]; bridge: Mitigation[] }>()
  const ensure = (ruleId: number) => {
    let bucket = mitigationsByRule.get(ruleId)
    if (!bucket) {
      bucket = { full: [], bridge: [] }
      mitigationsByRule.set(ruleId, bucket)
    }
    return bucket
  }
  for (const m of result.full_mitigations) ensure(m.rule_id).full.push(m)
  for (const m of result.bridge_mitigations) ensure(m.rule_id).bridge.push(m)

  return (
    <Stack spacing={2}>
      <Alert severity={noVulns ? 'success' : 'warning'}>{result.explanation}</Alert>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={`${result.evaluated_rule_count} rule${
            result.evaluated_rule_count === 1 ? '' : 's'
          } evaluated`}
          variant="outlined"
        />
        <Chip
          label={`${result.vulnerabilities.length} vulnerabilit${
            result.vulnerabilities.length === 1 ? 'y' : 'ies'
          }`}
          color={noVulns ? 'success' : 'error'}
          variant="outlined"
        />
        <Chip
          label={`${result.bridge_mitigation_count} bridge mitigation${
            result.bridge_mitigation_count === 1 ? '' : 's'
          }`}
          color={result.bridge_mitigation_count > 0 ? 'warning' : 'default'}
          variant="outlined"
        />
      </Stack>

      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Vulnerabilities
        </Typography>
        <Divider sx={{ mb: 1 }} />
        {noVulns ? (
          <Typography variant="body2" color="text.secondary">
            None — all evaluated rules hold for this observation.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {result.vulnerabilities.map((v) => {
              const bucket = mitigationsByRule.get(v.rule_id) ?? { full: [], bridge: [] }
              return (
                <VulnerabilityCard
                  key={v.rule_id}
                  vulnerability={v}
                  full={bucket.full}
                  bridge={bucket.bridge}
                />
              )
            })}
          </Stack>
        )}
      </Box>
    </Stack>
  )
}

function VulnerabilityCard({
  vulnerability,
  full,
  bridge,
}: {
  vulnerability: Vulnerability
  full: Mitigation[]
  bridge: Mitigation[]
}) {
  const noActions = full.length === 0 && bridge.length === 0
  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>
            {vulnerability.rule_name}
          </Typography>
          <Chip
            size="small"
            label={vulnerability.severity}
            color={SEVERITY_COLOR[vulnerability.severity]}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {vulnerability.description}
        </Typography>
        {vulnerability.detail && (
          <Box
            sx={{
              borderLeft: 3,
              borderColor: `${SEVERITY_COLOR[vulnerability.severity]}.main`,
              bgcolor: 'action.hover',
              borderRadius: '0 4px 4px 0',
              px: 1.5,
              py: 1,
              mb: 1.5,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}
            >
              Why it failed
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.primary' }}>
              {vulnerability.detail}
            </Typography>
          </Box>
        )}

        {noActions ? (
          <Box
            sx={{
              ml: 2,
              pl: 1.5,
              borderLeft: 2,
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              No mitigations available — this is an unmitigatable property characteristic.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              ml: 2,
              pl: 1.5,
              borderLeft: 2,
              borderColor: 'divider',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.75 }}
            >
              Recommended mitigations
            </Typography>
            <Stack spacing={1.5}>
              {full.length > 0 && (
                <MitigationGroup title="Full mitigations" mitigations={full} tier="full" />
              )}
              {bridge.length > 0 && (
                <MitigationGroup
                  title={`Bridge mitigations (${bridge.length})`}
                  mitigations={bridge}
                  tier="bridge"
                />
              )}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

function MitigationGroup({
  title,
  mitigations,
  tier,
}: {
  title: string
  mitigations: Mitigation[]
  tier: 'full' | 'bridge'
}) {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Chip
          size="small"
          label={tier}
          color={tier === 'full' ? 'primary' : 'warning'}
          variant="outlined"
          sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          {title}
        </Typography>
      </Stack>
      <List dense disablePadding>
        {mitigations.map((m) => (
          <ListItem key={m.id} disableGutters alignItems="flex-start" sx={{ py: 0.25 }}>
            <ListItemText
              primary={
                <Typography variant="body2" fontWeight={500}>
                  {m.name}
                </Typography>
              }
              secondary={
                <>
                  <Typography component="span" variant="body2" color="text.secondary">
                    {m.description}
                  </Typography>
                  {m.effect && (
                    <Typography
                      component="div"
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.25 }}
                    >
                      Effect: {m.effect}
                    </Typography>
                  )}
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
